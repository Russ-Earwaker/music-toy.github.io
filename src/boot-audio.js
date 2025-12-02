// src/boot-audio.js
// Ensure audio assets are loaded before applying theme defaults.

import { initAudioAssets } from './audio-samples.js';
import { makeDebugLogger } from './debug-flags.js';

const bootAudioLog = makeDebugLogger('mt_debug_logs', 'log');

async function bootAudio(){
  try{
    await initAudioAssets('./assets/samples/samples.csv');
    bootAudioLog('[boot-audio] samples loaded');
  }catch(e){
    console.warn('[boot-audio] init failed', e);
  }
  try{
    window.ThemeBoot?.wireAll?.();
  }catch(e){
    console.warn('[boot-audio] ThemeBoot wireAll failed', e);
  }
}

if (document.readyState==='loading')
  document.addEventListener('DOMContentLoaded', bootAudio);
else
  bootAudio();
