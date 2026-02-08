# Changelog

Version 1 started off with the design as outlined in the [Readme.md](./README.md) and then
accumulated a few revisions, as follows.

## Decouple ids from key name

By default, the name of the key being used to encrypt and decrypt a secret
is inherited from the identifier of that secret: `keys/<id>.key.json`.

We've changed that to use a default key name and path, instead of relying
on the secret identifier.  The default key being used will be stored in the
same directory as before, and under the path: `keys/default.key.json`.

Rationale: We want to reuse the same key across many secrets.

## Added a frontend

In `frontend` there is now a full-fledged web-server able to serve a webpage for using the shared secret application from browser client.