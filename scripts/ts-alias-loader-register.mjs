// Branche le résolveur d'alias. Séparé du résolveur lui-même, comme Node l'exige.
import { register } from "node:module";
register("./ts-alias-loader.mjs", import.meta.url);
