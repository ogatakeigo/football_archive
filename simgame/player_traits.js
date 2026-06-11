// Generated from the 2044 League trait calibration.
// It scores ability relative values + detailed season stats and applies the
// calibrated strictness offsets so no trait exceeded 7% in the 2044 sample.
(function () {
  const MIN_TRAIT_MINUTES = 200;
  const ATTRS_OUT = ["Shooting","Passing","Dribbling","Defense","Speed","Stamina","Physical","Decision","Mental"];
  const ATTRS_GK = ["Saving","Passing","Speed","Physical","Decision","Mental","Stamina"];
  const STATS = ["Goals","Assists","Shots","ShotsOnTarget","KeyPasses","PassAttempts","Dribbles","Crosses","Tackles","Interceptions","AerialsWon","Fouls","Saves","GoalsAgainst"];
  const TRAIT_LABELS = {"GK":["?????????","?????GK","??????GK","???GK","???GK","??????GK","????????","?????GK","PK?????","?????????GK","?????GK","???????GK","????GK","???GK","???GK","???????GK","????GK","??????GK","?????GK","????GK"],"CB":["?????","??????CB","????????CB","??????CB","?????CB","????CB","???CB","??????????","?????","???????","????????","???","??????CB","??????","???????CB","??????CB","?????CB","?????CB","?????CB","????CB"],"SB/WB":["???????SB","???????SB","???SB","???SB","?????SB","???????","??????SB","????SB","???SB","????SB","??????SB","??????SB","??????????SB","???????SB","?????SB","????SB","??????SB","??????SB","?????SB","????SB"],"CM/DM":["????","????","???????","????????????","?????????PM","???????","??????","????????","?????MF","???????MF","?????","?????MF","????????","???????","??????MF","?????","???MF","???MF","???MF","????MF"],"AM":["?????????","??????","???","??????AM","??????????","???????","????????","???????AM","????AM","???AM","??????AM","???AM","???????","??????","?????????","????????","????????AM","???????","??????MF","????AM"],"WG":["?????FW","???????WG","?????WG","??????????","?????????","???WG","??????????","?????WG","?????WG","???????","???WG","????WG","???????WG","?????WG","??????WG","????????","???WG","??????????WG","???MF","????WG"],"FW":["?????","???????","??????FW","?????????FW","???????","????????","??????FW","????????","??????FW","??????????","???????","??????????","?????FW","?????","?????????","?????FW","?????FW","????????","?????FW","????FW"]};
  const TRAIT_PROFILES = {"GK":[{"attrs":{"Saving":1.2,"Decision":0.4},"stats":{"Saves":1.2}},{"attrs":{"Speed":1.0,"Decision":0.8},"stats":{"GoalsAgainst":-0.7}},{"attrs":{"Passing":1.1,"Decision":0.7},"stats":{"PassAttempts":1.0}},{"attrs":{"Passing":1.2,"Mental":0.4},"stats":{"PassAttempts":0.7}},{"attrs":{"Mental":1.0,"Decision":0.8},"stats":{"GoalsAgainst":-1.0}},{"attrs":{"Saving":1.0,"Speed":0.5},"stats":{"Saves":1.0}},{"attrs":{"Physical":1.0,"Mental":0.5},"stats":{"GoalsAgainst":-0.5}},{"attrs":{"Mental":1.1,"Decision":0.9},"stats":{"GoalsAgainst":-0.6}},{"attrs":{"Saving":1.0,"Mental":0.8},"stats":{"Saves":0.8}},{"attrs":{"Decision":1.1,"Speed":0.5},"stats":{"GoalsAgainst":-0.8}},{"attrs":{"Speed":1.2,"Decision":0.5},"stats":{"GoalsAgainst":-0.5}},{"attrs":{"Saving":0.5,"Mental":1.0},"stats":{"GoalsAgainst":-1.2}},{"attrs":{"Saving":1.1,"Physical":0.5},"stats":{"Saves":1.1,"GoalsAgainst":0.6}},{"attrs":{"Physical":1.1,"Saving":0.5},"stats":{"Saves":0.4}},{"attrs":{"Decision":1.2,"Mental":0.5},"stats":{"GoalsAgainst":-0.5}},{"attrs":{"Passing":1.1,"Physical":0.4},"stats":{"PassAttempts":0.9}},{"attrs":{"Mental":1.0,"Passing":-0.4},"stats":{"GoalsAgainst":-0.9}},{"attrs":{"Speed":1.0,"Saving":0.4},"stats":{"Saves":0.5}},{"attrs":{"Saving":1.0,"Passing":-0.6},"stats":{"Saves":0.5}},{"attrs":{},"stats":{}}],"CB":[{"attrs":{"Defense":1.1,"Physical":0.8},"stats":{"Tackles":1.0}},{"attrs":{"Speed":1.0,"Defense":0.8},"stats":{"Interceptions":1.0}},{"attrs":{"Passing":1.0,"Decision":0.8},"stats":{"PassAttempts":0.9,"KeyPasses":0.5}},{"attrs":{"Passing":1.1},"stats":{"PassAttempts":1.0}},{"attrs":{"Physical":1.1,"Mental":0.5},"stats":{"AerialsWon":1.1}},{"attrs":{"Defense":1.0,"Physical":1.0},"stats":{"Tackles":0.8,"AerialsWon":0.8}},{"attrs":{"Mental":1.1,"Decision":0.8},"stats":{"GoalsAgainst":-0.6}},{"attrs":{"Decision":1.1,"Mental":0.8},"stats":{"Interceptions":0.4,"GoalsAgainst":-0.5}},{"attrs":{"Speed":1.0,"Decision":0.8},"stats":{"Interceptions":1.0}},{"attrs":{"Defense":1.1,"Stamina":0.5},"stats":{"Tackles":1.0}},{"attrs":{"Decision":1.0,"Defense":0.6},"stats":{"Interceptions":1.2}},{"attrs":{"Passing":1.0,"Dribbling":0.5},"stats":{"PassAttempts":0.8,"KeyPasses":0.5}},{"attrs":{"Defense":0.9,"Stamina":0.8},"stats":{"Tackles":1.0,"Fouls":0.5}},{"attrs":{"Mental":1.0,"Defense":0.8},"stats":{"GoalsAgainst":-0.6}},{"attrs":{"Passing":1.0,"Physical":0.4},"stats":{"PassAttempts":0.9}},{"attrs":{"Physical":1.0,"Shooting":0.4},"stats":{"AerialsWon":0.9,"Shots":0.4}},{"attrs":{"Decision":1.0,"Mental":0.8},"stats":{"Fouls":-0.8}},{"attrs":{"Physical":1.2},"stats":{"AerialsWon":0.5,"Tackles":0.5}},{"attrs":{"Defense":1.0,"Passing":-0.5},"stats":{"Tackles":0.5,"Interceptions":0.5}},{"attrs":{},"stats":{}}],"SB/WB":[{"attrs":{"Speed":1.0,"Stamina":0.8},"stats":{"Crosses":0.7,"Dribbles":0.5}},{"attrs":{"Passing":1.0,"Decision":0.8},"stats":{"PassAttempts":0.9,"Crosses":-0.5}},{"attrs":{"Speed":0.8,"Passing":0.5},"stats":{"Crosses":1.0,"KeyPasses":0.5}},{"attrs":{"Defense":1.1,"Physical":0.5},"stats":{"Tackles":1.0,"Crosses":-0.5}},{"attrs":{"Passing":1.0},"stats":{"Crosses":1.2,"KeyPasses":0.6}},{"attrs":{"Stamina":1.0,"Speed":0.8},"stats":{"Crosses":0.8,"Tackles":0.5}},{"attrs":{"Stamina":1.1,"Defense":0.5},"stats":{"Tackles":0.9,"Interceptions":0.5}},{"attrs":{"Defense":1.0,"Physical":0.8},"stats":{"Tackles":1.0}},{"attrs":{"Dribbling":1.0,"Speed":0.8},"stats":{"Dribbles":1.0}},{"attrs":{"Passing":0.6,"Decision":0.6},"stats":{"Assists":0.5,"KeyPasses":0.6}},{"attrs":{"Speed":1.0,"Defense":0.5},"stats":{"Interceptions":0.6}},{"attrs":{"Defense":1.0,"Passing":-0.4},"stats":{"Crosses":-0.8,"Shots":-0.5}},{"attrs":{"Passing":1.1,"Decision":0.8},"stats":{"KeyPasses":1.0}},{"attrs":{"Speed":1.0,"Stamina":0.8},"stats":{"Tackles":0.5,"Dribbles":0.5}},{"attrs":{"Dribbling":0.9,"Passing":0.5},"stats":{"PassAttempts":0.5,"Dribbles":0.5}},{"attrs":{"Speed":1.2},"stats":{"Dribbles":0.4}},{"attrs":{"Speed":0.9,"Shooting":0.5},"stats":{"Shots":0.6}},{"attrs":{"Passing":1.1,"Mental":0.5},"stats":{"PassAttempts":0.9}},{"attrs":{"Defense":0.5,"Passing":0.4},"stats":{"Crosses":0.6,"Tackles":0.5}},{"attrs":{},"stats":{}}],"CM/DM":[{"attrs":{"Passing":1.1,"Decision":0.9},"stats":{"PassAttempts":1.1}},{"attrs":{"Defense":1.0,"Decision":0.8},"stats":{"Interceptions":1.0,"Shots":-0.6}},{"attrs":{"Defense":1.0,"Physical":0.8},"stats":{"Tackles":1.0,"Interceptions":0.8}},{"attrs":{"Stamina":1.1,"Speed":0.5},"stats":{"Tackles":0.5,"KeyPasses":0.5,"Shots":0.4}},{"attrs":{"Passing":1.0,"Defense":0.5},"stats":{"PassAttempts":1.0,"Interceptions":0.5}},{"attrs":{"Passing":1.0,"Mental":0.8},"stats":{"PassAttempts":1.0}},{"attrs":{"Dribbling":0.5,"Passing":0.5,"Stamina":0.5},"stats":{"KeyPasses":0.6,"Shots":0.5}},{"attrs":{"Stamina":0.9,"Passing":0.6},"stats":{"KeyPasses":0.5,"Tackles":0.5}},{"attrs":{},"stats":{"PassAttempts":0.2,"Tackles":0.2}},{"attrs":{"Defense":1.0,"Mental":0.5},"stats":{"Interceptions":0.7,"PassAttempts":0.5}},{"attrs":{"Stamina":1.0,"Defense":0.5},"stats":{"Tackles":0.6,"PassAttempts":0.5}},{"attrs":{"Dribbling":1.1,"Stamina":0.5},"stats":{"Dribbles":1.0}},{"attrs":{"Shooting":1.0,"Decision":0.4},"stats":{"Shots":1.0}},{"attrs":{"Stamina":1.1,"Mental":0.5},"stats":{"Tackles":0.8}},{"attrs":{"Stamina":1.0,"Defense":0.5},"stats":{"Tackles":0.9,"Interceptions":0.5}},{"attrs":{"Decision":0.8,"Mental":0.8},"stats":{}},{"attrs":{"Passing":1.1},"stats":{"PassAttempts":0.9,"KeyPasses":0.5}},{"attrs":{"Defense":1.1},"stats":{"Tackles":0.6,"Interceptions":0.9}},{"attrs":{"Mental":1.1,"Decision":0.8},"stats":{"PassAttempts":0.4}},{"attrs":{},"stats":{}}],"AM":[{"attrs":{"Passing":1.0,"Dribbling":0.5},"stats":{"KeyPasses":1.0,"Tackles":-0.6}},{"attrs":{"Passing":1.0,"Mental":0.8},"stats":{"KeyPasses":1.0,"Dribbles":-0.4}},{"attrs":{"Passing":1.1,"Decision":0.9},"stats":{"KeyPasses":1.0}},{"attrs":{"Passing":1.0,"Dribbling":0.5},"stats":{"KeyPasses":1.0,"PassAttempts":0.8}},{"attrs":{"Shooting":1.0,"Decision":0.5},"stats":{"Goals":0.7,"Shots":1.0}},{"attrs":{"Shooting":1.0,"Dribbling":0.5},"stats":{"Shots":1.0}},{"attrs":{"Passing":1.0},"stats":{"Assists":0.8,"KeyPasses":1.0}},{"attrs":{"Dribbling":0.9,"Passing":0.5},"stats":{"Dribbles":0.5,"KeyPasses":0.6}},{"attrs":{"Dribbling":1.2},"stats":{"Dribbles":1.0}},{"attrs":{"Passing":0.6,"Decision":0.6},"stats":{"PassAttempts":1.0}},{"attrs":{"Stamina":1.0,"Defense":0.5},"stats":{"Tackles":0.6,"Interceptions":0.5}},{"attrs":{"Passing":0.5,"Speed":0.5},"stats":{"Crosses":0.7}},{"attrs":{"Passing":1.0,"Mental":0.8},"stats":{"PassAttempts":1.0}},{"attrs":{"Passing":1.1,"Decision":0.8},"stats":{"Assists":1.0}},{"attrs":{"Decision":1.0,"Dribbling":0.5},"stats":{"KeyPasses":0.5,"Shots":0.5}},{"attrs":{"Shooting":1.1},"stats":{"Shots":1.0}},{"attrs":{"Passing":0.6,"Dribbling":0.6},"stats":{"KeyPasses":0.5,"PassAttempts":0.5}},{"attrs":{"Speed":1.0,"Stamina":0.5},"stats":{"Goals":0.5}},{"attrs":{"Shooting":0.4,"Passing":0.4,"Dribbling":0.4},"stats":{"KeyPasses":0.3,"Shots":0.3}},{"attrs":{},"stats":{}}],"WG":[{"attrs":{"Shooting":1.0,"Speed":0.5},"stats":{"Goals":1.0,"Shots":1.0}},{"attrs":{"Shooting":0.6,"Dribbling":1.0},"stats":{"Shots":1.0,"Crosses":-0.6}},{"attrs":{"Passing":0.5,"Speed":0.5},"stats":{"Crosses":1.2}},{"attrs":{"Passing":1.1,"Decision":0.8},"stats":{"KeyPasses":1.0}},{"attrs":{"Speed":1.0,"Dribbling":1.0},"stats":{"Dribbles":1.0}},{"attrs":{"Speed":1.2},"stats":{"Dribbles":0.6,"Crosses":0.5}},{"attrs":{"Passing":1.0},"stats":{"Assists":0.8,"KeyPasses":1.0}},{"attrs":{"Passing":1.0},"stats":{"Crosses":1.2}},{"attrs":{"Shooting":1.1},"stats":{"Shots":1.0}},{"attrs":{"Decision":1.0,"Shooting":0.5},"stats":{"Goals":0.6,"Shots":0.5}},{"attrs":{"Stamina":1.0,"Defense":0.5},"stats":{"Tackles":0.6,"Interceptions":0.5}},{"attrs":{"Dribbling":1.2},"stats":{"Dribbles":1.0}},{"attrs":{"Dribbling":0.6,"Decision":0.6},"stats":{"KeyPasses":0.5,"Shots":0.5}},{"attrs":{"Dribbling":1.0,"Shooting":0.5},"stats":{"Shots":1.0,"Crosses":-0.5}},{"attrs":{"Speed":1.0,"Passing":0.5},"stats":{"Crosses":1.0}},{"attrs":{"Speed":1.0,"Dribbling":0.5},"stats":{"Dribbles":0.6,"KeyPasses":0.5}},{"attrs":{"Physical":1.1},"stats":{"AerialsWon":0.5}},{"attrs":{"Shooting":1.0,"Decision":0.5},"stats":{"Goals":0.6}},{"attrs":{"Stamina":0.5,"Passing":0.5},"stats":{"Crosses":0.5,"Tackles":0.4}},{"attrs":{},"stats":{}}],"FW":[{"attrs":{"Shooting":1.0,"Decision":0.8},"stats":{"Goals":1.1,"Shots":0.5}},{"attrs":{"Shooting":1.2},"stats":{"Goals":1.1}},{"attrs":{"Speed":1.0,"Shooting":0.5},"stats":{"Shots":1.0}},{"attrs":{"Passing":1.0,"Decision":0.5},"stats":{"KeyPasses":0.6,"PassAttempts":0.6}},{"attrs":{"Physical":1.1,"Mental":0.5},"stats":{"AerialsWon":1.0}},{"attrs":{"Physical":1.0,"Passing":0.5},"stats":{"KeyPasses":0.5,"AerialsWon":0.6}},{"attrs":{"Stamina":1.0,"Defense":0.5},"stats":{"Tackles":0.6,"Interceptions":0.5}},{"attrs":{"Speed":1.1,"Decision":0.5},"stats":{"Shots":0.6,"Goals":0.5}},{"attrs":{"Shooting":0.7,"Passing":0.5,"Physical":0.5},"stats":{"Goals":0.5,"Assists":0.5}},{"attrs":{"Shooting":1.0,"Dribbling":0.5},"stats":{"Shots":1.0}},{"attrs":{"Passing":0.6,"Dribbling":0.6},"stats":{"KeyPasses":0.5,"Shots":0.5}},{"attrs":{"Physical":1.0,"Shooting":1.0},"stats":{"Goals":0.6,"AerialsWon":0.5}},{"attrs":{"Speed":1.0,"Stamina":0.5},"stats":{"Shots":0.5}},{"attrs":{"Passing":1.1},"stats":{"Assists":0.5,"KeyPasses":0.6}},{"attrs":{"Speed":1.1},"stats":{"Shots":0.5}},{"attrs":{"Physical":1.2},"stats":{"AerialsWon":1.0}},{"attrs":{"Speed":1.0,"Shooting":0.5},"stats":{"Goals":0.5}},{"attrs":{"Shooting":1.1},"stats":{"Shots":1.1,"Goals":-0.2}},{"attrs":{},"stats":{"Shots":0.2,"Goals":0.2}},{"attrs":{},"stats":{}}]};
  const TRAIT_STAT_MEAN_SD = {"CM/DM":{"Goals":[0.080451,0.096861],"Assists":[0.104331,0.110226],"Shots":[0.613319,0.380802],"ShotsOnTarget":[0.237027,0.187035],"KeyPasses":[1.285075,0.428869],"PassAttempts":[2.804996,0.887487],"Dribbles":[0.076425,0.090043],"Crosses":[0.516169,0.714093],"Tackles":[0.785211,0.344287],"Interceptions":[0.977791,0.560142],"AerialsWon":[0.33312,0.208312],"Fouls":[0.194921,0.14196],"Saves":[0.0,0.0],"GoalsAgainst":[0.0,0.0]},"SB/WB":{"Goals":[0.060697,0.092752],"Assists":[0.049777,0.080961],"Shots":[0.455217,0.382017],"ShotsOnTarget":[0.173944,0.18226],"KeyPasses":[0.690711,0.370448],"PassAttempts":[1.273536,0.686091],"Dribbles":[0.189931,0.173305],"Crosses":[0.722531,0.621595],"Tackles":[1.207049,0.553134],"Interceptions":[0.510742,0.355696],"AerialsWon":[0.369563,0.2815],"Fouls":[0.295642,0.203896],"Saves":[0.0,0.0],"GoalsAgainst":[0.0,0.0]},"FW":{"Goals":[0.238387,0.195094],"Assists":[0.05012,0.080227],"Shots":[1.607098,0.701808],"ShotsOnTarget":[0.650627,0.36601],"KeyPasses":[0.61605,0.381634],"PassAttempts":[2.026561,0.989841],"Dribbles":[0.159928,0.163827],"Crosses":[0.272669,0.476722],"Tackles":[0.119124,0.18296],"Interceptions":[0.374529,0.29748],"AerialsWon":[0.787685,0.407313],"Fouls":[0.051573,0.076603],"Saves":[0.0,0.0],"GoalsAgainst":[0.0,0.0]},"GK":{"Goals":[0.0,0.0],"Assists":[0.005741,0.021112],"Shots":[0.0,0.0],"ShotsOnTarget":[0.0,0.0],"KeyPasses":[0.186201,0.172124],"PassAttempts":[0.263605,0.20739],"Dribbles":[0.0,0.0],"Crosses":[0.0,0.0],"Tackles":[0.0,0.0],"Interceptions":[0.0,0.0],"AerialsWon":[0.0,0.0],"Fouls":[0.0,0.0],"Saves":[2.089799,0.61602],"GoalsAgainst":[1.310105,0.610495]},"CB":{"Goals":[0.047324,0.06956],"Assists":[0.038104,0.067864],"Shots":[0.367036,0.293309],"ShotsOnTarget":[0.140134,0.140655],"KeyPasses":[0.673432,0.404246],"PassAttempts":[1.011934,0.551867],"Dribbles":[0.016378,0.04736],"Crosses":[0.281106,0.514281],"Tackles":[0.813105,0.307056],"Interceptions":[0.284515,0.219905],"AerialsWon":[1.261122,0.467837],"Fouls":[0.267613,0.157396],"Saves":[0.0,0.0],"GoalsAgainst":[0.0,0.0]},"AM":{"Goals":[0.145888,0.156358],"Assists":[0.109112,0.128813],"Shots":[1.157202,0.565451],"ShotsOnTarget":[0.451839,0.304299],"KeyPasses":[1.35877,0.528719],"PassAttempts":[3.297348,1.185215],"Dribbles":[0.28564,0.212223],"Crosses":[0.56878,0.717307],"Tackles":[0.363448,0.377461],"Interceptions":[0.250914,0.316724],"AerialsWon":[0.28612,0.260211],"Fouls":[0.080015,0.117767],"Saves":[0.0,0.0],"GoalsAgainst":[0.0,0.0]},"WG":{"Goals":[0.197105,0.169945],"Assists":[0.084844,0.10112],"Shots":[1.259341,0.611073],"ShotsOnTarget":[0.517376,0.307094],"KeyPasses":[1.144586,0.473375],"PassAttempts":[2.584717,1.062509],"Dribbles":[0.419612,0.236404],"Crosses":[0.809078,0.608132],"Tackles":[0.616062,0.369572],"Interceptions":[0.214588,0.212474],"AerialsWon":[0.295716,0.227159],"Fouls":[0.129617,0.130286],"Saves":[0.0,0.0],"GoalsAgainst":[0.0,0.0]}};
  const TRAIT_STRICTNESS = {"GK":[0.55825,-0.050375,0.013125,0.0,-0.1044,0.256375,-0.063775,0.0,0.328125,0.0,0.0,0.237125,0.411688,0.1155,0.0,0.0,-0.0108,0.0,0.646625,-0.058425],"CB":[0.115835,0.0,0.0,0.0,0.080061,0.098034,0.0,-0.115686,0.0,0.0,0.036204,0.0,0.0,0.072494,-0.03312,0.0,0.014533,0.002752,0.0,-0.355135],"SB/WB":[-0.024866,-0.016429,0.0,0.231471,0.0,-0.039445,0.243676,0.188971,0.184706,-0.085387,0.448162,0.690662,0.0,-0.005303,-0.010714,0.447353,0.050809,0.0,-0.152412,-0.531538],"CM/DM":[0.520524,0.044245,0.0,0.0,-0.020151,0.340094,-0.075488,0.0,-0.404855,-0.156629,-0.156579,0.267893,0.235314,0.031625,0.0,0.117327,0.358512,0.0,0.094801,-0.416637],"AM":[0.0,0.0,0.030962,0.0,0.0,0.0,0.0,0.037162,0.680615,-0.013231,0.078885,-0.015846,0.0,0.153192,0.014,0.0,-0.1332,0.0,-0.2396,-0.228892],"WG":[0.156534,0.0,-0.135407,0.0,0.348069,0.072897,0.0,0.0,0.109103,0.0,0.0,0.365086,-0.051393,-0.031366,0.0,0.002776,0.031379,0.086293,-0.283572,-0.350441],"FW":[0.234735,0.345548,-0.064707,0.0,0.336396,-0.01388,0.235848,-0.027873,-0.022855,0.0,-0.181583,0.316731,-0.013187,0.0,0.0,0.422473,0.0,0.084099,-0.374488,0.0]};
  const TRAIT_LABEL_NAMES = {
    "GK": ["ショットストッパー","スイーパーGK","ビルドアップGK","配球型GK","安定型GK","リアクションGK","ハイボール処理型","コーチングGK","PKストッパー","ラインコントロールGK","安全重視型GK","クリーンシートGK","被弾耐性GK","パワーGK","判断型GK","ロングフィードGK","低リスクGK","アグレッシブGK","クラシックGK","バランスGK"],
    "CB": ["ストッパー","カバーリングCB","ボールプレイングCB","ビルドアップCB","エアリアルCB","デュエルCB","統率型CB","ラインコントローラー","スイーパー","ハードマーカー","インターセプター","リベロ","アグレッシブCB","守備リーダー","ロングフィードCB","セットプレーCB","リスク管理CB","フィジカルCB","クラシックCB","バランスCB"],
    "SB/WB": ["オーバーラップSB","インバーテッドSB","攻撃的SB","守備的SB","クロッサーSB","ウイングバック","ハードワークSB","デュエルSB","推進型SB","サポートSB","カバーリングSB","ステイバックSB","ワイドプレーメーカーSB","トランジションSB","プレス耐性SB","スピードSB","ボックス侵入SB","ビルドアップSB","クラシックSB","バランスSB"],
    "CM/DM": ["レジスタ","アンカー","ボールウィナー","ボックス・トゥ・ボックス","ディープライイングPM","テンポメーカー","メッツァーラ","インサイドハーフ","セントラルMF","ホールディングMF","シャトラー","キャリー型MF","ミドルシューター","ハードワーカー","プレッシングMF","バランサー","展開型MF","守備的MF","統率型MF","バランスMF"],
    "AM": ["トレクァルティスタ","エンガンチェ","司令塔","アドバンスドAM","シャドーストライカー","セカンドトップ","チャンスメイカー","ハーフスペースAM","ドリブルAM","リンクAM","プレッシングAM","ワイドAM","テンポメーカー","ラストパサー","ライン間アタッカー","ミドルシューター","コンビネーションAM","フリーランナー","オフェンシブMF","バランスAM"],
    "WG": ["インサイドFW","インバーテッドWG","クラシックWG","ワイドプレーメーカー","スピードドリブラー","縦突破WG","チャンスクリエイター","クロッサーWG","ダイレクトWG","ラウムドイター","プレスWG","キャリアWG","ハーフスペースWG","カットインWG","タッチラインWG","サイドアタッカー","パワーWG","セカンドストライカーWG","ワイドMF","バランスWG"],
    "FW": ["ポーチャー","フィニッシャー","アドバンスドFW","ディープライイングFW","ターゲットマン","ポストプレーヤー","プレッシングFW","ラインブレイカー","コンプリートFW","シャドーストライカー","セカンドトップ","パワーフィニッシャー","ムービングFW","リンクマン","チャンネルランナー","エアリアルFW","カウンターFW","シュートハンター","セントラルFW","バランスFW"]
  };

  function field(row, key, fallback = '') {
    if (!row) return fallback;
    if (Object.prototype.hasOwnProperty.call(row, key)) return row[key] ?? fallback;
    const found = Object.keys(row).find((candidate) => candidate.toLowerCase() === key.toLowerCase());
    return found ? (row[found] ?? fallback) : fallback;
  }

  function number(row, key) {
    const value = field(row, key, 0);
    return Number(value || 0);
  }

  function per90(row, key) {
    const minutes = number(row, 'Minutes');
    return minutes > 0 ? number(row, key) * 90 / minutes : 0;
  }

  function clamp(value, low = -2.5, high = 2.5) {
    return Math.max(low, Math.min(high, value));
  }

  function zscore(value, mean, sd) {
    return sd > 1e-9 ? clamp((value - mean) / sd) : 0;
  }

  function groupPosition(position) {
    switch (String(position || '').toUpperCase()) {
      case 'GK': return 'GK';
      case 'CB': return 'CB';
      case 'RB':
      case 'LB':
      case 'RWB':
      case 'LWB': return 'SB/WB';
      case 'CM':
      case 'DM': return 'CM/DM';
      case 'AM': return 'AM';
      case 'RW':
      case 'LW':
      case 'RM':
      case 'LM': return 'WG';
      case 'CF':
      case 'ST':
      case 'SS': return 'FW';
      default: return 'CM/DM';
    }
  }

  function scoreTrait(row, group, index, profile, statValues) {
    const attrs = group === 'GK' ? ATTRS_GK : ATTRS_OUT;
    const avg = attrs.reduce((sum, attr) => sum + number(row, attr), 0) / attrs.length;
    if (index === 19) {
      const maxDelta = Math.max(...attrs.map((attr) => Math.abs(number(row, attr) - avg)));
      const statExt = STATS.reduce((sum, stat) => {
        const [mean, sd] = TRAIT_STAT_MEAN_SD[group]?.[stat] || [0, 1];
        return sum + Math.abs(zscore(statValues[stat] || 0, mean, sd));
      }, 0) / STATS.length;
      return 0.35 - maxDelta / 8.0 * 0.65 - statExt * 0.35;
    }

    let total = 0;
    let weight = 0;
    Object.entries(profile.attrs || {}).forEach(([attr, w]) => {
      total += w * clamp((number(row, attr) - avg) / 10.0);
      weight += Math.abs(w);
    });
    Object.entries(profile.stats || {}).forEach(([stat, w]) => {
      const [mean, sd] = TRAIT_STAT_MEAN_SD[group]?.[stat] || [0, 1];
      total += w * zscore(statValues[stat] || 0, mean, sd);
      weight += Math.abs(w);
    });
    return weight === 0 ? -9 : total / Math.sqrt(weight);
  }

  window.computePlayerTrait140 = function computePlayerTrait140(row) {
    if (number(row, 'Minutes') < MIN_TRAIT_MINUTES) return '-';
    const group = groupPosition(field(row, 'UsedPosition', field(row, 'PrimaryPosition')));
    const groupLabels = TRAIT_LABEL_NAMES[group] || TRAIT_LABEL_NAMES['CM/DM'];
    const profiles = TRAIT_PROFILES[group] || TRAIT_PROFILES['CM/DM'];
    const strictness = TRAIT_STRICTNESS[group] || [];
    const statValues = {};
    STATS.forEach((stat) => { statValues[stat] = per90(row, stat); });

    let bestIndex = 0;
    let bestScore = -Infinity;
    for (let index = 0; index < profiles.length; index += 1) {
      const adjusted = scoreTrait(row, group, index, profiles[index], statValues) - (strictness[index] || 0);
      if (adjusted > bestScore) {
        bestScore = adjusted;
        bestIndex = index;
      }
    }
    return groupLabels[bestIndex] || '-';
  };
})();
