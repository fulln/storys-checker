import { sceneDurations } from '../episodes/demo/timing.generated';

export const episode = {
  id: '2026-01-01-demo',
  scenes: [
    {id: 'open', durationInFrames: sceneDurations.open, layout: 'stage', year: '2006', headline: '柜台价格战'},
    {id: 'date', durationInFrames: sceneDurations.date, layout: 'date', year: '2006', headline: '报纸广告版式'},
    {id: 'promise', durationInFrames: sceneDurations.promise, layout: 'compare', year: '2006', headline: '第一次兑现'},
    {id: 'body', durationInFrames: sceneDurations.body, layout: 'timeline', year: '2006', headline: '三次升级'},
    {id: 'payoff', durationInFrames: sceneDurations.payoff, layout: 'payoff', year: '2006', headline: '回扣'},
  ],
  captions: [{ startMs: 0, endMs: 900, text: '二十年前的今天' }],
  voiceTracks: [{ file: 'audio/demo/open.mp3' }],
};
