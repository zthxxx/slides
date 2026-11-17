#!/bin/sh

greet() {
  name=${1:-terminal}
  printf 'Hello, %s!\n' "$name"
}

greet "$@"
