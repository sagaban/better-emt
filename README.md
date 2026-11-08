# ¿Qué bus cojo? — EMT València

PWA no oficial para planificar viajes en la EMT de València: dime de dónde salgo y a dónde voy, y te digo qué bus coger, en qué parada y a qué hora.

- Origen/destino por **mi ubicación**, **punto en el mapa** (tocar o arrastrar los marcadores) o **búsqueda de dirección**.
- Salir ahora / salir a las… / llegar a las…, preferir rapidez o menos transbordos, máximo a pie.
- Detalle paso a paso, paradas intermedias y llegadas en tiempo real (cuando EMT las ofrece).
- **Modo bici**: ruta que prioriza carriles bici, red ciclista municipal en el mapa y % del recorrido por carril.
- Favoritos (Casa, Trabajo…) guardados en el dispositivo.

## Desarrollo

```sh
pnpm install
pnpm dev        # http://localhost:5173
pnpm build && pnpm preview
pnpm icons      # regenera favicon y pwa-*.png desde public/icon.svg
                # (maskable y apple-touch salen de public/icon-maskable.svg)
```

Se despliega automáticamente en GitHub Pages al hacer push a `main` (`.github/workflows/deploy.yml`).

> La geolocalización y el service worker requieren HTTPS (o `localhost`). Para probar en el móvil, despliega en un hosting estático (Netlify, Vercel, Cloudflare Pages…) o usa un túnel HTTPS.

## Fuentes de datos

Todas aceptan CORS, así que la app es 100 % estática:

| Qué | Endpoint |
| --- | --- |
| Planificador (OpenTripPlanner de EMT) | `geoportal.emtvalencia.es/opentripplanner-api-webapp/ws/plan` |
| Llegadas en tiempo real | `geoportal.emtvalencia.es/EMT/mapfunctions/MapUtilsPetitions.php?sec=getSAE&parada=ID` |
| Rutas en bici | BRouter (`brouter.de`): perfil `safety` ("Equilibrada") y perfil propio `src/lib/brouter-carril.brf` ("Máximo carril bici"); si falla, el OTP de EMT en modo `BICYCLE` |
| Red ciclista | Ajuntament de València, `geoportal.valencia.es/.../OPENDATA/Trafico/MapServer/189` |
| Búsqueda de direcciones | Nominatim (OpenStreetMap) |
| Mapa base | OpenFreeMap (estilo *liberty*) |
