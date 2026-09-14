<?php

namespace App\Http\Controllers;

use App\Http\Requests\ModerationRuleRequest;
use App\Models\ModerationActivity;
use App\Models\ModerationFlag;
use App\Models\ModerationProcess;
use App\Models\ModerationRule;
use App\Models\ModerationRuleVersion;
use App\Models\WatchedArea;
use App\Services\OpenStreetMap\ModerationEditorSummaries;
use App\Services\OpenStreetMap\ModerationReader;
use App\Services\OpenStreetMap\ModerationRuleEvaluator;
use App\Services\OpenStreetMap\ModerationSummaryCache;
use Illuminate\Database\QueryException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

class ModerationRuleController extends Controller
{
    public function index(): Response
    {
        return Inertia::render('Moderation/Rules', ['rules' => ModerationRule::orderBy('name')->get(), 'processes' => ModerationProcess::where('name', 'not like', 'warm-%')->orderBy('name')->get()]);
    }

    public function edit(ModerationRule $rule): Response
    {
        return $this->form($rule);
    }

    private function form(?ModerationRule $rule): Response
    {
        return Inertia::render('Moderation/RuleForm', ['rule' => $rule, 'areas' => WatchedArea::orderBy('name')->get(['id', 'name']),
            'versions' => $rule?->versions()->latest('version')->get() ?? []]);
    }

    public function store(ModerationRuleRequest $request): RedirectResponse
    {
        $rule = $this->save($request, null);

        return to_route('moderation.rules.edit', $rule);
    }

    private function save(ModerationRuleRequest $request, ?ModerationRule $rule): ModerationRule
    {
        return DB::transaction(function () use ($request, $rule): ModerationRule {
            $values = $request->safe()->except('version');
            if ($rule) {
                $rule = ModerationRule::whereKey($rule->id)->lockForUpdate()->firstOrFail();
                if ((int) $request->validated('version') !== $rule->version) {
                    throw ValidationException::withMessages(['version' => 'This rule changed. Reload before saving.']);
                }
                $values['version'] = $rule->version + 1;
                $rule->update($values);
            } else {
                $rule = ModerationRule::create([...$values, 'version' => 1, 'enabled' => false]);
            }
            ModerationRuleVersion::create(['rule_id' => $rule->id, 'version' => $rule->version, 'user_id' => $request->user()->id,
                'configuration' => $rule->only(['name', 'description', 'type', 'severity', 'enabled', 'settings', 'conditions', 'exceptions', 'area_ids'])]);
            ModerationFlag::where('rule_id', $rule->id)->update(['stale' => true]);
            ModerationActivity::create(['user_id' => $request->user()->id, 'actor' => $request->user()->name, 'action' => 'rule.saved', 'subject_type' => 'rule', 'subject_id' => $rule->id, 'details' => ['name' => $rule->name, 'version' => $rule->version]]);
            DB::afterCommit(function () use ($rule): void {
                app(ModerationSummaryCache::class)->invalidate();
                $flags = ModerationFlag::where('rule_id', $rule->id)->get(['node_id', 'related_node_id']);
                app(ModerationEditorSummaries::class)->markEditorsForNodesDirty($flags->flatMap(fn (ModerationFlag $flag): array => [$flag->node_id, $flag->related_node_id]));
            });

            return $rule;
        });
    }

    public function update(ModerationRuleRequest $request, ModerationRule $rule): RedirectResponse
    {
        $this->save($request, $rule);

        return back();
    }

    public function create(): Response
    {
        return $this->form(null);
    }

    public function preview(ModerationRuleRequest $request, ModerationReader $reader, ModerationRuleEvaluator $evaluator): JsonResponse
    {
        $rule = new ModerationRule([...$request->safe()->except(['version']), 'version' => 1, 'enabled' => false]);
        try {
            $query = $reader->nodesWithinAreas($rule->area_ids ?: null)
                ->where('source.visible', true)
                ->whereRaw("source.tags->>'surveillance:type' = 'ALPR'");
            $nodes = $query->orderBy('source.id')->limit(26)->get();
            $deadline = microtime(true) + 10;
            $results = $nodes->take(25)->map(function ($node) use ($reader, $evaluator, $rule, $deadline): array {
                return microtime(true) >= $deadline
                    ? ['node_id' => $node->id, 'state' => 'not_evaluated', 'matches' => [], 'error' => 'Preview time limit reached.']
                    : $evaluator->evaluate($rule, $reader->normalize($node), false);
            });

            return response()->json(['results' => $results, 'sample_limit' => 25, 'truncated' => $nodes->count() > 25]);
        } catch (QueryException $exception) {
            report($exception);

            return response()->json(['message' => 'OpenStreetMap history is unavailable. Please retry the preview.'], 503);
        }
    }

    public function dismiss(Request $request, ModerationFlag $flag): RedirectResponse
    {
        $values = $request->validate(['evidence_hash' => ['required', 'string', 'size:64']]);
        DB::transaction(function () use ($request, $flag, $values): void {
            $flag = ModerationFlag::whereKey($flag->id)->lockForUpdate()->firstOrFail();
            if (! hash_equals($flag->evidence_hash, $values['evidence_hash'])) {
                throw ValidationException::withMessages(['flag' => 'This flag changed. Reload before dismissing.']);
            }
            if ($flag->status !== 'open') {
                return;
            }
            $flag->update(['status' => 'dismissed', 'dismissed_by' => $request->user()->id, 'dismissed_at' => now()]);
            ModerationActivity::create(['user_id' => $request->user()->id, 'actor' => $request->user()->name, 'action' => 'flag.dismissed', 'subject_type' => 'flag', 'subject_id' => $flag->id, 'details' => ['name' => $flag->rule->name, 'evidence_hash' => $flag->evidence_hash]]);
            DB::afterCommit(function () use ($flag): void {
                app(ModerationSummaryCache::class)->invalidate();
                app(ModerationEditorSummaries::class)->markEditorsForNodesDirty([$flag->node_id, $flag->related_node_id]);
            });
        });

        return back();
    }
}
