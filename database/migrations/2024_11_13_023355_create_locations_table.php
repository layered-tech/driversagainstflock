<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use MatanYadaev\EloquentSpatial\Objects\LineString;
use MatanYadaev\EloquentSpatial\Objects\Point;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        //        $points = [
        //            ['location' => ['-87.824700', '42.540417']],
        //            ['location' => ['-87.834495', '42.540480']],
        //            ['location' => ['-87.854378', '42.544681']],
        //            ['location' => ['-87.887878', '42.565997']],
        //            ['location' => ['-87.875842', '42.566300']],
        //            ['location' => ['-87.854241', '42.567044']],
        //            ['location' => ['-87.853678', '42.567185']],
        //            ['location' => ['-87.886983', '42.567861']],
        //            ['location' => ['-87.882490', '42.581393']],
        //            ['location' => ['-87.882186', '42.581586']],
        //            ['location' => ['-87.880708', '42.588687']],
        //            ['location' => ['-87.883206', '42.588964']],
        //            ['location' => ['-87.879358', '42.602328']],
        //            ['location' => ['-87.877455', '42.603362']],
        //            ['location' => ['-87.873946', '42.603510']],
        //            ['location' => ['-87.878332', '42.603970']],
        //            ['location' => ['-87.821988', '42.607826']],
        //            ['location' => ['-87.822437', '42.608585']],
        //            ['location' => ['-87.820700', '42.609344']],
        //            ['location' => ['-87.855639', '42.609804']],
        //            ['location' => ['-87.855892', '42.610964']],
        //            ['location' => ['-87.846049', '42.631526']],
        //            ['location' => ['-87.845747', '42.632079']],
        //            ['location' => ['-87.835785', '42.632990']],
        //            ['location' => ['-87.836123', '42.637076']],
        //            ['location' => ['-87.943901', '42.722383']],
        //            ['location' => ['-87.979083', '42.950655']],
        //            ['location' => ['-87.949478', '42.952209']],
        //            ['location' => ['-88.008374', '42.952542']],
        //            ['location' => ['-88.006374', '42.956318']],
        //            ['location' => ['-88.047773', '42.956536']],
        //            ['location' => ['-87.909997', '42.956964']],
        //            ['location' => ['-88.017827', '42.959216']],
        //            ['location' => ['-88.009243', '42.959295']],
        //            ['location' => ['-88.044849', '42.959326']],
        //            ['location' => ['-87.988457', '42.961068']],
        //            ['location' => ['-88.008103', '42.961090']],
        //            ['location' => ['-87.909447', '42.961956']],
        //            ['location' => ['-88.003066', '42.967169']],
        //            ['location' => ['-88.008090', '42.969910']],
        //            ['location' => ['-87.955887', '42.974057']],
        //            ['location' => ['-87.955072', '42.976041']],
        //            ['location' => ['-87.958391', '42.976537']],
        //            ['location' => ['-88.235720', '42.977913']],
        //            ['location' => ['-88.257219', '42.978529']],
        //            ['location' => ['-88.227507', '42.979011']],
        //            ['location' => ['-87.981700', '42.980855']],
        //            ['location' => ['-88.047583', '42.980962']],
        //            ['location' => ['-88.047210', '42.981012']],
        //            ['location' => ['-88.209830', '42.986867']],
        //            ['location' => ['-88.237307', '42.988047']],
        //            ['location' => ['-88.003631', '42.988194']],
        //            ['location' => ['-88.251895', '42.988325']],
        //            ['location' => ['-88.226407', '42.988345']],
        //            ['location' => ['-88.266214', '42.988457']],
        //            ['location' => ['-88.007617', '42.988826']],
        //            ['location' => ['-88.017433', '42.988949']],
        //            ['location' => ['-88.266285', '42.989311']],
        //            ['location' => ['-88.200475', '42.995808']],
        //            ['location' => ['-88.039911', '42.997918']],
        //            ['location' => ['-87.987418', '42.999214']],
        //            ['location' => ['-88.035398', '43.000143']],
        //            ['location' => ['-88.039708', '43.002633']],
        //            ['location' => ['-87.982027', '43.003007']],
        //            ['location' => ['-88.210856', '43.003420']],
        //            ['location' => ['-88.231910', '43.004145']],
        //            ['location' => ['-87.987566', '43.008517']],
        //            ['location' => ['-88.236442', '43.009807']],
        //            ['location' => ['-88.226823', '43.009843']],
        //            ['location' => ['-87.985151', '43.010262']],
        //            ['location' => ['-88.235309', '43.012833']],
        //            ['location' => ['-88.226836', '43.012942']],
        //            ['location' => ['-88.198370', '43.014060']],
        //            ['location' => ['-88.033526', '43.016471']],
        //            ['location' => ['-87.988302', '43.016702']],
        //            ['location' => ['-87.984842', '43.016854']],
        //            ['location' => ['-87.938850', '43.016978']],
        //            ['location' => ['-87.944183', '43.017078']],
        //            ['location' => ['-87.988811', '43.017141']],
        //            ['location' => ['-87.984950', '43.017999']],
        //            ['location' => ['-88.201862', '43.020797']],
        //            ['location' => ['-87.947953', '43.021850']],
        //            ['location' => ['-87.943206', '43.022381']],
        //            ['location' => ['-88.217309', '43.022389']],
        //            ['location' => ['-88.000148', '43.022945']],
        //            ['location' => ['-87.935028', '43.023011']],
        //            ['location' => ['-88.017348', '43.023123']],
        //            ['location' => ['-87.933158', '43.023678']],
        //            ['location' => ['-88.007250', '43.023965']],
        //            ['location' => ['-87.986628', '43.024089']],
        //            ['location' => ['-88.200572', '43.024142']],
        //            ['location' => ['-88.047352', '43.025733']],
        //            ['location' => ['-88.189429', '43.026778']],
        //            ['location' => ['-88.220548', '43.027281']],
        //            ['location' => ['-88.176312', '43.032347']],
        //            ['location' => ['-88.176566', '43.032778']],
        //            ['location' => ['-88.176666', '43.036413']],
        //            ['location' => ['-88.176677', '43.036421']],
        //            ['location' => ['-87.957536', '43.039467']],
        //            ['location' => ['-87.957803', '43.039639']],
        //            ['location' => ['-88.225665', '43.041747']],
        //            ['location' => ['-88.285848', '43.042741']],
        //            ['location' => ['-88.266429', '43.045325']],
        //            ['location' => ['-88.256202', '43.045353']],
        //            ['location' => ['-87.911064', '43.046081']],
        //            ['location' => ['-87.911072', '43.046611']],
        //            ['location' => ['-88.255968', '43.047989']],
        //            ['location' => ['-87.914206', '43.064419']],
        //            ['location' => ['-87.913956', '43.064697']],
        //            ['location' => ['-88.226171', '43.084324']],
        //            ['location' => ['-88.226555', '43.086344'], 'properties' => ['heading' => 75, 'excluded_locations' => [['-88.22636547847291', '43.08644333190841']]]],
        //            ['location' => ['-87.947189', '43.087142']],
        //            ['location' => ['-87.967186', '43.087681']],
        //            ['location' => ['-87.975525', '43.089214']],
        //            ['location' => ['-87.967117', '43.090272']],
        //            ['location' => ['-87.977578', '43.090928']],
        //            ['location' => ['-87.946878', '43.091831']],
        //            ['location' => ['-87.946847', '43.096369']],
        //            ['location' => ['-87.966881', '43.101939']],
        //            ['location' => ['-87.966544', '43.106017']],
        //            ['location' => ['-88.244499', '43.110156']],
        //            ['location' => ['-88.078839', '43.118816']],
        //            ['location' => ['-87.957375', '43.119158']],
        //            ['location' => ['-88.025589', '43.119514']],
        //            ['location' => ['-88.025908', '43.119919']],
        //            ['location' => ['-88.024758', '43.133944']],
        //            ['location' => ['-88.074711', '43.148305']],
        //            ['location' => ['-88.024514', '43.176811']],
        //            ['location' => ['-88.063679', '43.176873']],
        //            ['location' => ['-88.103534', '43.181415']],
        //
        //            // Lisbon...
        //            ['location' => ['-88.26161339742085', '43.19152137833822'], 'properties' => ['heading' => 150]],
        //            ['location' => ['-88.26113230339624', '43.194444941666234'], 'properties' => ['heading' => 330]],
        //
        //            // Germantown...
        //            ['location' => ['-88.14329885195374', '43.19612640098294'], 'properties' => ['heading' => 195]],
        //            ['location' => ['-88.13670808047786', '43.19199853723809'], 'properties' => ['heading' => 280]],
        //            ['location' => ['-88.13651260303457', '43.19222245618798'], 'properties' => ['heading' => 300]],
        //            ['location' => ['-88.12824395876102', '43.192584906376425'], 'properties' => ['heading' => 280]],
        //            ['location' => ['-88.1406304259706', '43.19470774150551'], 'properties' => ['heading' => 150]],
        //            ['location' => ['-88.14501159057241', '43.21613592060826'], 'properties' => ['heading' => 60]],
        //            ['location' => ['-88.1028367113526', '43.192511486081315'], 'properties' => ['heading' => 330]],
        //            ['location' => ['-88.13111460563185', '43.19234972063759'], 'properties' => ['heading' => 105, 'excluded_locations' => [['-88.13108723254031', '43.19230210255105']]]],
        //            ['location' => ['-88.08262051087564', '43.20674512295379']],
        //            ['location' => ['-88.06381893681774', '43.22119532643673']],
        //
        //            // Menomonee Falls...
        //            ['location' => ['-88.12582102759954', '43.192269940661404'], 'properties' => ['heading' => 125]],
        //            ['location' => ['-88.13333448288603', '43.18972758796859'], 'properties' => ['heading' => 200]],
        //            ['location' => ['-88.1403858498334', '43.19162209958306'], 'properties' => ['heading' => 165]],
        //            ['location' => ['-88.1288224159131', '43.18707203732808'], 'properties' => ['heading' => 90]],
        //
        //            // Brookfield...
        //            ['location' => ['-88.10702298571411', '43.02635911493318'], 'properties' => ['heading' => 30]],
        //            ['location' => ['-88.06820592290812', '43.01642391021357'], 'properties' => ['heading' => 315]],
        //
        //            // Wauwatosa...
        //            ['location' => ['-88.04681353779284', '43.03556349383831'], 'properties' => ['heading' => 330]],
        //            ['location' => ['-88.06630461343704', '43.03675295448867'], 'properties' => ['heading' => 225]],
        //
        //            ['location' => ['-88.023713', '43.195451']],
        //            ['location' => ['-87.967798', '43.199218']],
        //            ['location' => ['-88.003924', '43.205045']],
        //            ['location' => ['-87.923363', '43.221116']],
        //            ['location' => ['-87.922888', '43.221383']],
        //            ['location' => ['-88.027579', '43.221454']],
        //
        //            // Richfield...
        //            ['location' => ['-88.183700', '43.250974'], 'properties' => ['heading' => 225]],
        //
        //            // Slinger...
        //            ['location' => ['-88.26085122620336', '43.322810315781055'], 'properties' => ['heading' => 45]],
        //
        //            ['location' => ['-88.189008', '43.324572']],
        //            ['location' => ['-88.189337', '43.397629']],
        //            ['location' => ['-88.193595', '43.397835']],
        //            ['location' => ['-88.856712', '43.441118']],
        //            ['location' => ['-88.835619', '43.456226']],
        //            ['location' => ['-88.816769', '43.456466']],
        //            ['location' => ['-88.817910', '43.466410']],
        //            ['location' => ['-88.829818', '43.467725']],
        //            ['location' => ['-88.819127', '43.477231']],
        //            ['location' => ['-88.835126', '43.480786']],
        //            ['location' => ['-88.818175', '43.483835']],
        //            ['location' => ['-88.810014', '43.485840']],
        //            ['location' => ['-88.810249', '43.485928']],
        //            ['location' => ['-88.816706', '43.486206']],
        //
        //            // Kewaskum...
        //            ['location' => ['-88.215507', '43.497466'], 'properties' => ['heading' => 315]],
        //            ['location' => ['-88.240414', '43.557647'], 'properties' => ['heading' => 315]],
        //
        //            ['location' => ['-88.805304', '43.507310']],
        //            ['location' => ['-88.267987', '43.572723']],
        //
        //            // Oconomowoc...
        //            ['location' => ['-88.49925053473014', '43.11879690138915'], 'properties' => ['heading' => 180]],
        //            ['location' => ['-88.48617276857706', '43.10703372745987'], 'properties' => ['heading' => 225]],
        //            ['location' => ['-88.5209439711586', '43.119637466483745'], 'properties' => ['heading' => 90]],
        //            ['location' => ['-88.47081717399473', '43.07065257488707'], 'properties' => ['heading' => 330]],
        //
        //            // Delafield...
        //            ['location' => ['-88.37105631809975', '43.054014318346276'], 'properties' => ['heading' => 75]],
        //            ['location' => ['-88.36237277222878', '43.10028326210913'], 'properties' => ['heading' => 225]],
        //
        //            // Pewaukee...
        //            ['location' => ['-88.22537529993276', '43.050501759722025'], 'properties' => ['heading' => 315, 'excluded_locations' => [['-88.22553113550201', '43.0506488563311']]]],
        //        ];

        Schema::create('markers', function (Blueprint $table) {
            $table->increments('id');
            $table->unsignedInteger('bearing')->nullable()->index();
            $table->timestamps();
        });

        Schema::create('locations', function (Blueprint $table) {
            $table->id();
            $table->unsignedInteger('marker_id')->index();
            $table->string('type');
            $table->geometry('point', subtype: 'point', srid: '4326')->nullable();
            // $table->geometry('view_area', subtype: 'polygon')->nullable();
            $table->timestamps();
        });

        //        foreach ($points as $point) {
        //            $marker = Marker::query()->create([
        //                'bearing' => $bearing = Arr::get($point, 'properties.heading'),
        //            ]);
        //
        //            $location = Arr::get($point, 'location');
        //
        //            Location::query()->create([
        //                'marker_id' => $marker->id,
        //                'type' => 'marker',
        //                'point' => new Point(
        //                    $location[1],
        //                    $location[0]
        //                ),
        //                'view_area' => $bearing ? new Polygon($this->getShape(
        //                    $location[0],
        //                    $location[1],
        //                    $bearing
        //                )) : null,
        //            ]);
        //
        //            if ($excludedLocations = Arr::get($point, 'properties.excluded_locations')) {
        //                foreach ($excludedLocations as $excludedLocation) {
        //                    Location::query()->create([
        //                        'marker_id' => $marker->id,
        //                        'type' => 'excluded',
        //                        'point' => new Point(
        //                            $excludedLocation[1],
        //                            $excludedLocation[0]
        //                        ),
        //                    ]);
        //                }
        //            }
        //        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('markers');
        Schema::dropIfExists('locations');
    }

    public function degToRad($deg): float|int
    {
        return ($deg * M_PI) / 180;
    }

    public function radToDeg($rad): float|int
    {
        return ($rad * 180) / M_PI;
    }

    public function calculateNewPosition($lat, $lon, $distanceFt, $bearingDeg, $earthRadiusFt): array
    {
        // Convert distance to radians
        $distanceRad = $distanceFt / $earthRadiusFt;

        // Convert latitude and longitude to radians
        $latRad = $this->degToRad($lat);
        $lonRad = $this->degToRad($lon);

        // Convert bearing to radians
        $bearingRad = $this->degToRad($bearingDeg);

        // Calculate the new latitude
        $newLatRad = asin(sin($latRad) * cos($distanceRad) + cos($latRad) * sin($distanceRad) * cos($bearingRad));

        // Calculate the new longitude
        $newLonRad = $lonRad + atan2(sin($bearingRad) * sin($distanceRad) * cos($latRad), cos($distanceRad) - sin($latRad) * sin($newLatRad));

        // Convert the result back to degrees
        $newLat = $this->radToDeg($newLatRad);
        $newLon = $this->radToDeg($newLonRad);

        return ['lat' => $newLat, 'lon' => $newLon];
    }

    public function getShape($lon, $lat, $heading, $distance = 100, $spread = 25): array
    {
        $earthRadiusFt = 20925646.325;

        $centralPoint = $this->calculateNewPosition($lat, $lon, $distance, $heading, $earthRadiusFt);

        $bearingLeft = $heading - 90;
        $bearingRight = $heading + 90;

        $leftEdge = $this->calculateNewPosition($centralPoint['lat'], $centralPoint['lon'], $spread, $bearingLeft, $earthRadiusFt);
        $rightEdge = $this->calculateNewPosition($centralPoint['lat'], $centralPoint['lon'], $spread, $bearingRight, $earthRadiusFt);

        return [
            new LineString([
                new Point($lat, $lon),
                new Point($rightEdge['lat'], $rightEdge['lon']),
                new Point($centralPoint['lat'], $centralPoint['lon']),
                new Point($leftEdge['lat'], $leftEdge['lon']),
                new Point($lat, $lon),
            ]),
        ];
    }
};
