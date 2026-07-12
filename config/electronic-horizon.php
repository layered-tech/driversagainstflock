<?php

return [
    'alpr_cache_seconds' => (int) env('ELECTRONIC_HORIZON_ALPR_CACHE_SECONDS', 30),
    'alpr_maximum_results' => (int) env('ELECTRONIC_HORIZON_ALPR_MAXIMUM_RESULTS', 50),
    'alpr_path_buffer_meters' => (int) env('ELECTRONIC_HORIZON_ALPR_PATH_BUFFER_METERS', 65),
    'maximum_path_length_meters' => (int) env('ELECTRONIC_HORIZON_MAXIMUM_PATH_LENGTH_METERS', 17_000),
];
