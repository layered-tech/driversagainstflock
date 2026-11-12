package org.driversagainstflock.tv

import org.json.JSONObject

data class TvPlace(val name: String, val latitude: Double, val longitude: Double) {
    fun json() = JSONObject().put("name", name).put("latitude", latitude).put("longitude", longitude)
    companion object {
        fun parse(json: JSONObject): TvPlace {
            val lat = json.getDouble("latitude")
            val lng = json.getDouble("longitude")
            require(lat.isFinite() && lng.isFinite() && lat in -90.0..90.0 && lng in -180.0..180.0)
            return TvPlace(json.optString("name", "Place").take(160), lat, lng)
        }
    }
}
