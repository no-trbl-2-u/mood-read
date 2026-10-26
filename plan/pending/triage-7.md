---
date: 2026-10-26
---
## Add plan/05-mood-read-v2.md
~~~ acceptance
- **A?issue-7** The web build removes a previous book's downloaded files before a new one finishes downloading, so it keeps at most one book offline as 05.6/05.8 already promise (#7).
~~~
~~~ chunks
- [ ] **05.?issue-7** Web build caps offline books at one via removeDownload (#7) · S · closes A?issue-7 · needs —
  - Apply 05.4's one-at-a-time rule to book files on web: before a new book's download starts, call 05.7's `removeDownload` on any other book already on device.
~~~
