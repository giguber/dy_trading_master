// dy_master 冷门股机杀全流程兔动管理 v3.0 索刔放吆版
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
    if (!h!|!l) continue;
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