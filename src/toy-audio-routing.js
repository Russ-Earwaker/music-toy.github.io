// Event/cancellation ownership stays on the visible occurrence. Linked toys
// share their Master's authored gain/mute bus, rather than a copied gain value.
export const playbackAudioBusId = (toyId, occurrence) => occurrence?.sourceAudioToyId || toyId || 'master';
