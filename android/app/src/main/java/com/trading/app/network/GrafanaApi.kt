package com.trading.app.network

import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

interface GrafanaService {
    @POST("auth/login")
    suspend fun login(@Body creds: Map<String, String>): LoginResponse

    @GET("search")
    suspend fun search(@Query("query") query: String): List<DashboardSearchItem>

    @GET("dashboards/{uid}")
    suspend fun getDashboard(@Path("uid") uid: String): DashboardResponse

    @POST("query")
    suspend fun queryData(@Body query: Map<String, Any>): Any
}

data class LoginResponse(val accessToken: String, val refreshToken: String)
data class DashboardSearchItem(val uid: String, val title: String, val url: String, val type: String)
data class DashboardResponse(val dashboard: Any?, val meta: Any?) // Simplified
