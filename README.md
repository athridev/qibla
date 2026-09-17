# Qibla · قبلة

A privacy-conscious, map-based Qibla finder that works without a magnetic compass.

Choose your exact position, mark a visible landmark you are facing, and the app calculates how far to turn toward the Kaaba. The map also shows the complete great-circle route between your position and the Kaaba.

## Features

- Guided three-step flow: position, visible landmark, Qibla direction
- Refined browser GPS with an accuracy estimate
- Hotel and place search through Photon/OpenStreetMap
- Manual pin placement and coordinate or map-link input
- Full great-circle route with direction arrows at every zoom level
- Street and satellite map layers
- Arabic and English interface, plus core-flow translations for 18 more languages
- Installable on iOS and Android as a Progressive Web App
- No account, camera, microphone, compass, analytics, or server-side location storage

## How the calculation works

The app calculates the initial bearing from the selected position to the Kaaba using spherical trigonometry and a great-circle route. It then compares that bearing with the bearing from the position to the visible landmark selected by the user.

The complete route may look curved on a flat map. That is expected because the shortest route over the Earth is being projected onto a flat surface.

The result depends on the accuracy of the selected position and landmark. Users should correct the pins against visible streets or buildings and physically face the selected landmark before applying the shown turn.

## Run locally

The app has no build step. Serve the repository over HTTP:

```bash
python3 -m http.server 4173
```

Then open `http://localhost:4173`.

Location permission requires HTTPS in production. Localhost is allowed by modern browsers.

## Deployment

The repository is configured as a static Vercel project. Import it into Vercel or deploy from the CLI:

```bash
vercel --prod
```

## Data providers

- Map interface: [Leaflet](https://leafletjs.com/)
- Street map: [OpenStreetMap](https://www.openstreetmap.org/copyright)
- Satellite imagery: Esri World Imagery
- Place search: [Photon](https://photon.komoot.io/) using OpenStreetMap data

Availability and coverage depend on these providers. The app itself does not save user coordinates or searches.

## Contributing

Bug reports and focused improvements are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
