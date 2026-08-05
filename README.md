# ADFX Sound

The website for ADFX Sound, served as static files by GitHub Pages at
[www.adfxsound.com](https://www.adfxsound.com).

It was previously a Squarespace site. This is a rebuild of the same pages with the
Squarespace runtime removed: no JavaScript framework, no analytics, no cookie banner,
and no requests to any host except the YouTube embeds (and only after a click). The
three scripts it does ship — `Scripts/player.js`, `Scripts/nav.js`, and
`Scripts/youtube.js` — replace the ~3.3 MB of Squarespace bundles that were only
driving the audio players, the mobile menu, and the embeds.

YouTube embeds are static poster buttons (`.yt-facade`) in the HTML so they stay
editable in Pinegrow. `youtube.js` loads the real player on click and forces a
1080p rendition. To add a video: duplicate a facade block, set `data-yt-src` to
`https://www.youtube.com/embed/{ID}`, set the button's `background-image`
to `Resources/yt-{ID}.webp`, and drop that WebP into `Resources/`.

## Layout

| Path | Contents |
| --- | --- |
| `*.html` | The five pages, at the publish root |
| `Resources/` | Images, converted screen recordings, and video posters |
| `Audio/` | The MP3s behind the audio players |
| `Styles/` | Stylesheets, plus the editor sprite icons `site.css` refers to |
| `Scripts/` | Audio player, mobile nav toggle, and YouTube facade |
| `Fonts/` | Jost (as a stand-in for futura-pt) and the icon font |
| `_tools/` | Build and verification scripts. Not published |

`_tools/` is in `.gitignore` and never uploads.

The pristine capture the site is built from, `_source/`, has been moved out to
`..\ADFXSOUND_SOURCE_ARCHIVE` so this folder stays small. It is ~63 MB of full-size
originals that no visitor ever needs.

## Rebuilding

Copy `_source/` back in from the archive first, then:

```
python _tools/build.py
```

Without `_source/` the build stops immediately and changes nothing.

The build reads `_source/` and rewrites the entire output tree, so it is safe to
re-run and the sources are never modified. Anything edited by hand in `Resources/`,
`Audio/`, `Styles/`, `Scripts/` or `Fonts/` will be overwritten; change `build.py`
instead.

Requirements:

- Python 3
- [ffmpeg](https://ffmpeg.org) and [ImageMagick 7](https://imagemagick.org) for the
  asset re-encoding. If either is missing the build still completes, warns, and ships
  the originals unoptimised.
- Node and Chrome, for the browser checks only

Encoded assets are cached under `_tools/.optcache`, keyed by source content, so only
the first build pays for the video encoding.

### Asset re-encoding

Squarespace served every image through a resizing CDN, so the capture holds
full-size originals that were never sent to a browser: 4000px photographs and screen
recordings stored as GIF. The build re-encodes them on the way in, taking the
published tree from 58 MB to 19 MB.

- Animated GIFs become H.264 and VP9 video with a JPEG poster, and the `<img>` tag
  becomes an autoplaying muted `<video>`. This is where most of the saving is: 25.2 MB
  of GIF becomes 2.6 MB of video.
- Opaque PNGs become JPEGs, and anything wider than 2000px is downscaled. `#page` is
  1318px wide, so 2000px is still better than 2x retina.
- A re-encode is only kept if it is actually smaller, so nothing is ever inflated.

## Verifying

```
python _tools/verify.py            # structure: broken refs, orphans, leftover runtime
_tools/checkall.ps1                # behaviour: renders each page in headless Chrome
```

`verify.py` is the important one before publishing. It checks that every local
reference resolves, that no path differs from another only by case (GitHub Pages
serves from a case-sensitive filesystem), and that `CNAME` and `.nojekyll` are
present.

## Hosting

GitHub Pages, deployed from the `main` branch at the repository root. `CNAME` binds
the custom domain and `.nojekyll` stops Pages from running Jekyll over the output.
Both are written by `build.py`.

## Rights

All rights reserved. The photography, audio, video, logos, and page copy are the
property of Andrew Dearing and are not licensed for reuse. The repository is public
so that GitHub can serve it, which is not an offer of any license to its contents.

Third-party components ship under their own terms:

- Jost by indestructible type\*, SIL Open Font License 1.1, see `Fonts/OFL.txt`
- The Squarespace-derived stylesheets and icon font remain the property of
  Squarespace, Inc.
