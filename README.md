# Reels Assist (Android)

Instagram sa loob ng WebView + 4 na button sa gilid:

- **Like / Save** – ikaw ang pipindot, isang Reel lang kada tap.
- **Draft** – kukunin ang caption, hihingi ng comment sa server mo, at ilalagay sa comment box. **Hindi ito nagpo-post.** Basahin, i-edit, at pindutin ang Post ikaw mismo.
- **Set** – server URL at token.

Walang auto-scroll, auto-follow, auto-post, o pag-spoof ng visibility.

## 1. I-build ang APK sa GitHub
1. Gumawa ng bagong repo sa GitHub, i-upload ang LAHAT ng laman ng folder na ito (kasama ang `.github`).
2. Pumunta sa **Actions** -> **Build APK** -> **Run workflow** (kusa rin itong tatakbo sa bawat push sa `main`).
3. Pagkatapos (mga 3-5 min), buksan ang run -> **Artifacts** -> i-download ang `ReelsAssist-apk` -> i-unzip -> `app-debug.apk`.
4. I-install sa phone (payagan ang "Install unknown apps").

## 2. Patakbuhin ang server sa PC
1. Node 18+ at ang AI server mo (default `http://127.0.0.1:10100/v1`, palitan gamit ang `AI_BASE_URL`).
2. Sa `server/start.bat` palitan ang `AUTH_TOKEN` ng sarili mong secret, tapos patakbuhin.
3. Hanapin ang LAN IP ng PC (`ipconfig`), payagan ang port 3000 sa Windows Firewall (Private lang).
4. Sa app: **Set** -> URL `http://<IP-ng-PC>:3000`, at ang parehong token.

Dapat nasa parehong Wi-Fi ang phone at PC. Para sa labas ng bahay, gumamit ng Tailscale.

## Tandaan
- Hindi pa na-test ang build na ito sa device. Kung may error sa Actions, ipadala ang log.
- Puwedeng magbago ang layout ng Instagram at hindi na makita ng script ang mga button/comment box.
- Debug-signed ang APK: ayos para sa personal na gamit.
