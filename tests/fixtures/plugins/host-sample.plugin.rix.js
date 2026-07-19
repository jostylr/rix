/**
id: host-sample
description: A discovered host plugin whose installer is supplied by the host.
kind: host
mount: hostSample
exports:
  - Value
groups: [Examples]
permissions: []
defaultEnabled: false
**/

export function install() {
  throw new Error("The catalog scanner must never execute this file");
}
