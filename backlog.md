# Backlog of ideas

- Add a constraint that `keyedDataId` must be exactly 32 bytes
- There should be no overlap bt top-level readme and v1/readme
- The `message` should actually be `input` throughout
- Add shortcuts for CLI-based access, so that we don't have to type the long `.. retrieve:decrypt` and `.. store:encrypt` commands with `npm`.
- Passing an identifier that has no data stored will throw error "An unexpected error occurred:Error: No data found for..". This should be handled smoothly.
- Browser store flow returns as soon as the tx hash is returned, before the transaction is mined. If the user clicks "Retrieve" immediately after "Encrypt & Store", the RPC view call may return empty bytes ("No data found") because the tx hasn't been included in a block yet. Fix: call `waitForTransactionReceipt` after the write and only show success once confirmed.
- Do an in-depth audit of the whole prototype
