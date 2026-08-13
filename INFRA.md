## Terraform workflow

Terraform 1.15 and AWS provider 6 are pinned by each root. Run commands from the
specific root being changed.

```bash
cd infrastructure/aws/routing
terraform init
terraform fmt -check
terraform validate
terraform plan -var 'alert_email=alerts@example.com' -out routing.tfplan
```

`terraform plan` makes no AWS changes. Review the entire result before applying:
it should not propose changing, replacing, or deleting shared production
resources. The first routing plan was reviewed as `42 to add, 0 to change, 0 to
destroy`; future plans must be reviewed anew.

Apply only a saved, reviewed plan and only with explicit approval:

```bash
terraform apply routing.tfplan
```

The alert email is marked sensitive so it is redacted in Terraform CLI output.
AWS sends a one-time confirmation email for the SNS subscription; alerts do not
arrive until it is confirmed. Do not pass the email in a checked-in `.tfvars`
file.

Use normal Terraform state commands for inspection, such as `terraform state
list`. Never run `terraform destroy`, delete the state bucket, delete graph
artifacts, or terminate the persistent serving instance without a separate,
explicitly approved destructive plan.

### Bootstrap root

[`infrastructure/aws/bootstrap`](infrastructure/aws/bootstrap) is the small,
one-time root that owns the remote-state bucket itself. It is already in use. Do
not reapply it casually: it protects its bucket with `prevent_destroy`.

If a first-time bootstrap apply ever partially creates the bucket and then fails
on a provider read-back, add only the specific denied read permission, confirm the
bucket independently, clear only the local Terraform taint, and make a new
non-destructive plan. Do not bypass the bucket protection.

## Operating the routing service

Terraform provides the compute, roles, storage, and launch template. It does
not install the routing service, create releases, or perform cutovers. Those
actions are intentional SSM workflows using the versioned operation scripts.
Consult the operations directory in the appropriate access-controlled checkout
for the current script names and versions.

Run these scripts through SSM, never SSH. Their output must stay free of precise
coordinates, credentials, service endpoints, resource identifiers, or network
topology. Authentication material remains in the approved secret-management
service; never print or copy it into shell history, documentation, tickets, or
logs.

The build workflow verifies its source data and artifacts before publishing a
release. The deployment workflow verifies the release before activation and
rolls back automatically if the service does not become ready.

Before editing any operation script, run its static checks:

```bash
bash infrastructure/aws/routing/operations/test.sh
```

## Monitoring and recovery

Use the approved monitoring dashboard and alerting channels for service health,
capacity, network, storage, and build metrics. Names, identifiers, thresholds,
and notification destinations are maintained outside this document.

For an operational problem:

1. Inspect the dashboard, alarm state, and SSM status first.
2. Use SSM to inspect the affected host without printing secrets, endpoints,
   resource identifiers, or coordinate-bearing request output.
3. For a failed graph deployment, rely on the deployment script's automatic
   rollback; do not delete the previous graph release.
4. For an infrastructure change such as resizing, make the variable change,
   generate a fresh plan, and obtain approval before applying it.

The persistent serving instance is configured to preserve its data during an
instance-initiated shutdown. Plan infrastructure changes to retain required
network identity and graph data.

## Important boundaries

- The stack is private-only. Do not add public IPs, public DNS, or SSH ingress.
- Only the application is a permitted client of the routing service.
- Use SSM and IAM instance roles for workload operation; the local AWS profile is
  for operator actions only.
- Treat `Moonlit Cloud` public networking as read-only from this Terraform root.
- Keep state, artifact, storage, and DNS resources protected by their Terraform
  lifecycle guards.
- Always review a new plan before any apply, including a recovery or resize.
