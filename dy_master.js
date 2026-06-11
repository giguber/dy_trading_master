// dy_master 冷门股猎杀全流程 v3.0 终极融合版
var m = {};
m.httpGet = function(url, t) {
  t = t || 10000;
  return new Promise(function(r) {
    var req = require('https').get(url, {timeout: t}, function(res) {
      var d = '';
      res.on('data', function(c) { d += c; });
      res.on('end', function() { try { r(JSON.parse(d)); } catch(e) { r({e:'parse:'+e.message}); } });
    });
    req.on('timeout', function() { req.destroy(); r({e:'timeout'}); });
    req.on('error', function(e) { r({e:'req:'+e.message}); });
  });
};

m.getSecId = function(c) {
  var p = c.charAt(0);
  return (p==='6'||p==='9') ? '1.'+c : '0.'+c;
};

m.calcATR = function(ks, p) {
  p = p || 14;
  if (!ks || ks.length < p+1) return 2;
  var trs = [], n = Math.min(ks.length, 60);
  for (var i=1; i<n; i++) {
    var h, l, pc;
    if (typeof ks[i] === 'string') {
      var a = ks[i].split(','), b = ks[i-1].split(',');
      h = parseFloat(a[2]||a[3]||0); l = parseFloat(a[3]||a[4]||0); pc = parseFloat(b[2]||0);
    } else {
      h = ks[i].high||0; l = ks[i].low||0; pc = (ks[i-1]&&(ks[i-1].close||ks[i-1].c))||0;
    }
    if (!h||!l) continue;
    trs.push(Math.max(h-l, Math.abs(h-pc), Math.abs(l-pc)));
  }
  if (trs.length < 3) return 2;
  var s = 0; for (var j=0; j<trs.length; j++) s += trs[j];
  return s/trs.length;
};

m.scoreByStrategy = function(s, cfg) {
  var str = cfg.strategy.current;
  var params = cfg.strategy[str] || cfg.strategy.momentum;
  var sc = 0;
  if (str === 'momentum') {
    if (s.f3 > 9.5) sc += params.score_high_pct;
    else if (s.f3 > 7) sc += Math.round(params.score_high_pct*0.7);
    else if (s.f3 > 5) sc += Math.round(params.score_high_pct*0.5);
    if (s.f20 > 10000 && s.f20 < 500000) sc += params.score_vol_surge;
    if (s.f21 > 5000 && s.f21 < 50000) sc += params.score_cap_med;
    if (s.f184 > 2 && s.f184 < 15) sc += params.score_vol_ratio;
  } else if (str === 'reversal') {
    if (s.f3 < -3 && s.f3 > -7) sc += params.score_low_pct;
    if (s.f20 > 5000 && s.f20 < 100000) sc += params.score_volume_drop;
    if (s.f184 > 0.5 && s.f184 < 2) sc += params.score_oversold;
  } else if (str === 'breakout') {
    if (s.f3 > 8) sc += params.score_high_pct;
    if (s.f184 > 3 && s.f184 < 20) sc += params.score_vol_ratio;
    if (s.f20 > 50000 && s.f20 < 300000) sc += params.score_cap;
  }
  return sc;
};

m.runScanner = async function(cfg) {
  var url = 'https://push2.eastmoney.com/api/qt/clist/get?cb=&fid=f3&po=1&pz=100&pn=1&np=1&fltt=2&invt=2&fs=m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23,m:0+t:81+s:2048&fields=f2,f3,f12,f14,f20,f21,f62,f184,f115,f43,f44,f45,f167,f168,f169,f170,f171&_='+Date.now();
  var res = await m.httpGet(url);
  if (res.e) { console.log('[scan] err: '+res.e); return []; }
  var items = (res.data && res.data.diff) || [];
  console.log('[scan] raw: '+items.length);
  var picks = [];
  for (var i=0; i<items.length; i++) {
    var s = items[i];
    if (!s.f12 || s.f3===undefined || !s.f2) continue;
    if (s.f2 < cfg.scanner.minPrice || s.f2 > cfg.scanner.maxPrice) continue;
    if (s.f3 < cfg.scanner.minPct) continue;
    var tv = s.f20 || 0;
    if (tv < cfg.scanner.minTurnover || tv > cfg.scanner.maxTurnover) continue;
    var sc = m.scoreByStrategy(s, cfg);
    picks.push({c:s.f12, n:s.f14, p:s.f2||0, chg:s.f3||0, tv:tv, vol:s.f21||0, vr:s.f184||1, sc:sc});
  }
  picks.sort(function(a,b){return b.sc-a.sc;});
  return picks.slice(0, cfg.scanner.maxPicks);
};

m.runDeep = async function(picks, cfg) {
  // 大盘风控
  var idxs = ['1.000001','0.399001','0.399006'];
  var mkt = [];
  for (var i=0; i<idxs.length; i++) {
    var u = 'https://push2.eastmoney.com/api/qt/stock/get?secid='+idxs[i]+'&fields=f43,f44,f45,f46,f47,f48,f49,f50,f51,f52,f55,f57,f58,f116,f117,f162&_='+Date.now();
    var r = await m.httpGet(u);
    if (!r.e && r.data) mkt.push({idx:idxs[i], chg:r.data.f170!==undefined?r.data.f170:0});
  }
  var hasD = false, hasH = false;
  for (var i=0; i<mkt.length; i++) {
    var p = mkt[i].chg||0;
    if (p < -3) hasD = true;
    else if (p < -2) hasH = true;
  }
  var risk = hasD ? 'danger' : (hasH ? 'high' : 'low');
  console.log('[deep] risk: '+risk);

  var analyzed = [];
  for (var i=0; i<picks.length; i++) {
    var st = picks[i], sid = m.getSecId(st.c);
    var u1 = 'https://push2.eastmoney.com/api/qt/stock/get?secid='+sid+'&fields=f43,f44,f45,f46,f47,f48,f49,f50,f51,f52,f55,f57,f58,f116,f117,f162,f167,f168,f169,f170,f171&_='+Date.now();
    var r1 = await m.httpGet(u1);
    if (r1.e || !r1.data) continue;
    var d = r1.data;

    var u2 = 'https://push2.eastmoney.com/api/qt/stock/kline/get?secid='+sid+'&fields1=f1,f2,f3&fields2=f51,f52,f53,f54,f55,f56,f57&klt=5&fqt=1&end=20500101&lmt=30&_='+Date.now();
    var r2 = await m.httpGet(u2);
    var ks = (r2&&r2.data&&r2.data.klines) || [];
    var atr = m.calcATR(ks, cfg.deep.atrPeriod);
    var price = d.f43 || st.p || 0;
    if (!price) continue;
    var volume = d.f47 || st.vol || 0;
    var isC = volume < cfg.deep.coldVolThreshold;
    var sp = Math.max(atr/price*100, cfg.deep.minStopPct);
    if (isC) sp *= cfg.deep.coldMult;
    sp = Math.min(sp, cfg.deep.maxStopPct);
    var pp = Math.max(atr/price*100*2, 5);
    var chg = d.f170!==undefined ? d.f170 : (st.chg||0);
    var sc = 50;
    if (atr > 0.5 && atr < 5) sc += 10;
    if (d.f184 && d.f184 > 2) sc += 10;
    if (risk === 'danger') sc -= 30;
    else if (risk === 'high') sc -= 15;
    else if (risk === 'low' && chg > 0) sc += 10;
    sc = Math.max(0, Math.min(100, sc));

    analyzed.push({c:st.c, n:st.n, p:price, chg:chg, vol:volume, tv:d.f45||st.tv||0, vr:d.f184||st.vr||1,
      atr:+atr.toFixed(2), stp:+(price*(1-sp/100)).toFixed(2), sp:+sp.toFixed(2),
      pp:+(price*(1+pp/100)).toFixed(2), ppct:+pp.toFixed(2), cold:isC, risk:risk, sc:sc});
  }
  analyzed.sort(function(a,b){return b.sc-a.sc;});
  return analyzed;
};

m.checkRisk = function() {
  try {
    var rf = '/sdcard/Download/.dy_risk.json';
    var fs = require('fs');
    var r = fs.existsSync(rf) ? JSON.parse(fs.readFileSync(rf,'utf8')) : {pl:0, losses:0, date:''};
    return r;
  } catch(e) { return {pl:0, losses:0, date:''}; }
};

m.updateRisk = function(pl, loss) {
  try {
    var rf = '/sdcard/Download/.dy_risk.json';
    var fs = require('fs');
    var r = m.checkRisk();
    var today = new Date().toISOString().slice(0,10);
    if (r.date !== today) { r = {pl:0, losses:0, date:today}; }
    r.pl += pl;
    if (loss) r.losses++;
    fs.writeFileSync(rf, JSON.stringify(r));
    return r;
  } catch(e) { return null; }
};

m.notify = function(analyzed, cfg) {
  try {
    if (!cfg.notify.enableNotify) return;
    var fs = require('fs');
    var alerts = analyzed.filter(function(a){return a.sc >= cfg.notify.scoreMinNotify;});
    if (!alerts.length) return;
    var msg = alerts.map(function(a){return a.n+'('+a.c+') 评分'+a.sc+' 止损'+a.sp+'%';}).join('\n');
    fs.writeFileSync('/sdcard/Download/.dy_alert.txt', 'score>=80:\n'+msg);
    console.log('[alert] written '+alerts.length+' alerts');
  } catch(e) { console.log('[alert] err: '+e.message); }
};

m.main = async function() {
  var fs = require('fs');
  var cfgPath = '/sdcard/Download/dy_config.json';
  if (!fs.existsSync(cfgPath)) { console.log('[master] no config'); return; }
  var cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  console.log('[master] strategy: '+cfg.strategy.current);

  // 熔断检查
  var risk = m.checkRisk();
  var today = new Date().toISOString().slice(0,10);
  if (risk.date === today && risk.pl <= cfg.risk.dailyLossLimit) {
    console.log('[master] daily loss limit hit, skip');
    return;
  }
  if (risk.date === today && risk.losses >= cfg.risk.consecutiveLossLimit) {
    console.log('[master] consecutive losses limit hit, skip');
    return;
  }

  var picks = await m.runScanner(cfg);
  if (!picks.length) { console.log('[master] no picks'); return; }
  console.log('[master] picks: '+picks.map(function(p){return p.c;}).join(','));

  var analyzed = await m.runDeep(picks, cfg);
  var qualified = analyzed.filter(function(a){return a.sc >= cfg.deep.scoreThreshold;});
  console.log('[master] qualified: '+qualified.length);

  var output = {
    time: new Date().toISOString(), strategy: cfg.strategy.current,
    risk: {level: analyzed.length ? analyzed[0].risk : 'unknown', todayPL: risk.pl, todayLosses: risk.losses},
    picks: qualified.slice(0, 5), all: analyzed
  };
  fs.writeFileSync('/sdcard/Download/dy_result.json', JSON.stringify(output, null, 2));
  console.log('[master] result -> /sdcard/Download/dy_result.json');

  m.notify(qualified, cfg);
};

m.main();
