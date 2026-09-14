// Front-facing 2D presets. Screen ratios follow manufacturer specifications;
// bezel, corner and finish values are visual approximations, not CAD assets.
export const ANDROID_DEVICES={
  'galaxy-s26-ultra':{name:'Samsung Galaxy S26 Ultra',ratio:3120/1440,radius:.085,padding:7,hole:.011,body:'#20242B',metal:['#72777F','#CDD0D6','#6A707A','#A9ADB5','#555B65'],buttons:[[.2,.095],[.335,.06]]},
  'pixel-10-pro':{name:'Google Pixel 10 Pro',ratio:2856/1280,radius:.155,padding:8,hole:.014,body:'#30353A',metal:['#888E93','#F1F2F4','#A2A8AE','#E3E7EB','#767E87'],buttons:[[.2,.055],[.31,.105]]},
  'xiaomi-17':{name:'Xiaomi 17',ratio:2656/1220,radius:.125,padding:6,hole:.011,body:'#171A1D',metal:['#42464B','#ACB2BA','#4A5058','#7C858E','#363B42'],buttons:[[.21,.105],[.35,.065]]},
  'android-generic':{name:'Универсальный Android',ratio:20/9,radius:.09,padding:9,hole:.013,body:'#1B2027',metal:['#69727C','#D5D9DE','#5C6570','#A3ABB5','#414A54'],buttons:[[.24,.1]],legacy:true}
};
export const DEFAULT_ANDROID_DEVICE='galaxy-s26-ultra';
const IPHONE={name:'iPhone',ratio:2868/1320,radius:.14,padding:9,body:'#1B2027',metal:['#69727C','#D5D9DE','#5C6570','#A3ABB5','#414A54'],buttons:[[.24,.1]],island:true};
export const IPHONE_DEVICES={
 'iphone-17':{...IPHONE,name:'iPhone 17',ratio:2622/1206,padding:7,radius:.145,body:'#303132'},
 'iphone-17-pro':{...IPHONE,name:'iPhone 17 Pro',ratio:2622/1206,padding:7,radius:.145,body:'#AAAEB4',metal:['#969CA4','#F5F6F7','#666D75','#DADDE0','#777E85']},
 'iphone-17-pro-max':{...IPHONE,name:'iPhone 17 Pro Max',padding:6.5,radius:.14,body:'#D07646',metal:['#B45E30','#F5BA83','#8C4727','#E3A06C','#A15B34']},
 'iphone-air':{...IPHONE,name:'iPhone Air',ratio:2736/1260,padding:6,radius:.135,body:'#ADC0D2',metal:['#8197AB','#E1EFFB','#647D91','#CFDFED','#7992A7']},
 'iphone-16-pro':{...IPHONE,name:'iPhone 16 Pro',ratio:2622/1206,padding:7.5,radius:.145,body:'#A2988A',metal:['#928A7D','#DDD6C9','#6B6359','#B7ADA0','#82786B']},
 'iphone-generic':{...IPHONE,legacy:true}
};
export function deviceFor(project){return project.store==='apple'?(IPHONE_DEVICES[project.iphoneDevice]||IPHONE):ANDROID_DEVICES[project.androidDevice||'android-generic']||ANDROID_DEVICES['android-generic'];}
