# Android App Build & Run Guide

Since you have Android Studio installed (`C:\Program Files\Android\Android Studio\bin\studio64.exe`), follow these exact steps to build the app.

## Phase 1: Open the Project

1.  **Launch Android Studio**
    *   Press `Windows Key`, type `Android Studio`, and open it.
    *   *Alternative*: Run `C:\Program Files\Android\Android Studio\bin\studio64.exe` directly.

2.  **Open Project**
    *   On the Welcome screen, click **Open**.
    *   Navigate to: `C:\Github_sync\trading-stack\android`
    *   Click **OK**.

3.  **Trust Project**
    *   If asked, click "Trust Project".

## Phase 2: Sync and Build

1.  **Wait for Sync**
    *   Look at the bottom status bar. You will see "Gradle Sync" or "Importing".
    *   **Crucial**: Wait until this finishes. It may take 2-5 minutes as it downloads the Android SDK and tools automatically.

2.  **Handle Missing SDKs (Automatic)**
    *   If you see a link saying "Install missing SDK platforms" or "Install Build Tools", click it and accept the license. Android Studio handles this for you.

## Phase 3: Run the App

1.  **Create a Virtual Device (Emulator)**
    *   Look at the top-right toolbar. If it says "No Devices", click on the dropdown and select **Device Manager**.
    *   Click **Using the Emulator** (or the **+** button).
    *   Select **Pixel 6** -> **Next**.
    *   Select a System Image (e.g., **Release Name: UpsideDownCake** or **Tiramisu**). Download it if needed (click the down arrow).
    *   Click **Next** -> **Finish**.

2.  **Run**
    *   Select your new emulator from the top dropdown.
    *   Click the green **Play** button (triangle icon) in the top toolbar.
    *   The emulator will launch, and the app will start.

## Phase 4: Verify Backend Connection

1.  **Check Backend Status**
    *   Ensure your Docker containers are running: `docker compose ps`
    *   Verify Nginx is up (it routes traffic).

2.  **Connection Settings**
    *   The app is configured to use: `https://insights.digii4.co.in/api/mobile/v1/`
    *   **Ensure your emulator/device can resolve this domain** (it maps to `localhost:3000` via your tunnel).
    *   If using Emulator and the domain doesn't work, revert `MainActivity.kt` to `http://10.0.2.2:3000/...`.

3.  **Login**
    *   Mock login is enabled (`admin` / `admin`).

## Troubleshooting

*   **App says "Network Error"**:
    *   Run `docker compose logs -f nginx` in your terminal to see if requests are reaching the server.
    *   Ensure Nginx is running on port 3000.
*   **"Grafana Token" error**:
    *   In your terminal, run: `.\scripts\provision_grafana.ps1`
    *   Then restart the BFF: `docker compose restart bff`
