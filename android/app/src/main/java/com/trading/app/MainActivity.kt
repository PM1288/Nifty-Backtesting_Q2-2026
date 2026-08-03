package com.trading.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.Alignment
import androidx.compose.foundation.background
import com.trading.app.network.DashboardSearchItem
import com.trading.app.network.GrafanaService
import kotlinx.coroutines.launch
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            TradingApp()
        }
    }
}

// Simple Singleton for Token Management
object TokenManager {
    var accessToken: String? = null
}

// Interceptor to add Bearer Token
class AuthInterceptor : okhttp3.Interceptor {
    override fun intercept(chain: okhttp3.Interceptor.Chain): okhttp3.Response {
        val original = chain.request()
        val token = TokenManager.accessToken
        return if (token != null) {
            val request = original.newBuilder()
                .header("Authorization", "Bearer $token")
                .build()
            chain.proceed(request)
        } else {
            chain.proceed(original)
        }
    }
}

@Composable
fun TradingApp() {
    var notLoggedIn by remember { mutableStateOf(true) }

    // Recreate Retrofit/API whenever login state changes (or just once with dynamic interceptor)
    // Here we use a dynamic interceptor approach, so one instance is enough via remember
    val api = remember {
        val client = okhttp3.OkHttpClient.Builder()
            .addInterceptor(AuthInterceptor())
            .build()

        Retrofit.Builder()
            .baseUrl("https://insights.digii4.co.in/api/mobile/v1/")
            .client(client)
            .addConverterFactory(GsonConverterFactory.create())
            .build()
            .create(GrafanaService::class.java)
    }

    if (notLoggedIn) {
        LoginScreen(api) {
            notLoggedIn = false
        }
    } else {
        var selectedDashboardUid by remember { mutableStateOf<String?>(null) }
        if (selectedDashboardUid == null) {
            DashboardListScreen(api) { uid -> selectedDashboardUid = uid }
        } else {
            DashboardDetailScreen(api, selectedDashboardUid!!) { selectedDashboardUid = null }
        }
    }
}

@Composable
fun LoginScreen(api: GrafanaService, onLoginSuccess: () -> Unit) {
    var username by remember { mutableStateOf("admin") }
    var password by remember { mutableStateOf("admin") }
    var isLoading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    Column(
        modifier = Modifier.fillMaxSize().padding(16.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text("Login to Trading App", style = MaterialTheme.typography.headlineMedium)
        Spacer(modifier = Modifier.height(16.dp))

        OutlinedTextField(value = username, onValueChange = { username = it }, label = { Text("Username") })
        Spacer(modifier = Modifier.height(8.dp))
        OutlinedTextField(value = password, onValueChange = { password = it }, label = { Text("Password") }) // VisualTransformation left as exercise
        Spacer(modifier = Modifier.height(16.dp))

        if (isLoading) {
            CircularProgressIndicator()
        } else {
            Button(onClick = {
                scope.launch {
                    isLoading = true
                    error = null
                    try {
                        // Real Login Call
                        val response = api.login(mapOf("username" to username, "password" to password))
                        TokenManager.accessToken = response.accessToken
                        onLoginSuccess()
                    } catch (e: Exception) {
                        e.printStackTrace()
                        error = "Login Failed: ${e.message}"
                    } finally {
                        isLoading = false
                    }
                }
            }) {
                Text("Login")
            }
        }

        if (error != null) {
             Spacer(modifier = Modifier.height(8.dp))
             Text(error!!, color = Color.Red)
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DashboardListScreen(api: GrafanaService, onDashboardClick: (String) -> Unit) {
    var dashboards by remember { mutableStateOf<List<DashboardSearchItem>>(emptyList()) }
    var isLoading by remember { mutableStateOf(true) }
    var errorMessage by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(Unit) {
        try {
            dashboards = api.search("")
            isLoading = false
        } catch (e: Exception) {
            e.printStackTrace()
            errorMessage = "Failed to load: ${e.message}"
            isLoading = false
        }
    }

    if (isLoading) {
        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            CircularProgressIndicator()
        }
    } else if (errorMessage != null) {
        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Text(text = errorMessage!!, color = Color.Red)
        }
    } else {
        LazyColumn {
            items(dashboards) { dash ->
                ListItem(
                    headlineContent = { Text(dash.title) },
                    modifier = Modifier.clickable { onDashboardClick(dash.uid) }
                )
                Divider()
            }
        }
    }
}

@Composable
fun DashboardDetailScreen(api: GrafanaService, uid: String, onBack: () -> Unit) {
    var dashboardJson by remember { mutableStateOf("Loading...") }
    LaunchedEffect(uid) {
        try {
            val res = api.getDashboard(uid)
            dashboardJson = res.toString()
        } catch (e: Exception) {
            dashboardJson = "Error: ${e.message}"
        }
    }

    Column(modifier = Modifier.padding(16.dp)) {
        Button(onClick = onBack) { Text("Back") }
        Text("Dashboard: $uid", style = MaterialTheme.typography.headlineMedium)
        Spacer(modifier = Modifier.height(16.dp))
        Text("Native Chart Placeholder")
        Box(modifier = Modifier.fillMaxWidth().height(200.dp).background(Color.LightGray)) {
            Text("Chart Area", modifier = Modifier.align(Alignment.Center))
        }
        Spacer(modifier = Modifier.height(16.dp))
        Text(dashboardJson)
    }
}
