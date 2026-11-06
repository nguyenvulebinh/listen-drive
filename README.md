# Listen Drive

Practice German driving-lesson listening. The site opens on a random topic, plays a short YouTube clip, and asks you to pick the correct English answer.

Commands is the same screen for the spoken exam lines. Open Filters and choose Commands. Those MP3s are already in `audio/`. The ElevenLabs key is not part of this site.

## Try it locally

Needs HTTP so YouTube and data files load:

```bash
python3 -m http.server
```

Open http://127.0.0.1:8000/

## GitHub Pages

Settings → Pages → Deploy from a branch → `main`, folder `/ (root)`.
