// Compatibility entry point. Native toy initialization installs curated controls.
// Do not inject duplicate Advanced buttons or expose dormant percussion editors.
export {installToyAdvanced as ensureToyAdvanced} from './toy-advanced.js';
