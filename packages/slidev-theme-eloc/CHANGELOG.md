# Changelog


## [1.0.1](https://github.com/zthxxx/slides/compare/slidev-theme-eloc@1.0.0...slidev-theme-eloc@1.0.1) (2022-05-23)

### chore

Make slide canvasWidth from `1422.22 (16:10)` to `1580 (16:9)`, without visual changes,
due to both height of `1422.22 (16:10)` and `1580 (16:9)` is same `888.75`, so that canvas scale also not change.

Relate reason: float number of width CANNOT use in playwright-chromium for screenshot or export PDF.

## [1.0.0](https://github.com/zthxxx/slides/tree/slidev-theme-eloc@1.0.0/packages/slidev-theme-eloc) (2022-05-22)

First public [slidev-theme-eloc](https://www.npmjs.com/package/slidev-theme-eloc) package.
