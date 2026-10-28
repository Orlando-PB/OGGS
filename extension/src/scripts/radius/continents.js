// Which continent each country in draw-guess's geo.json is in, for the radius script's
// Continent setting. Russia and Turkey count as Europe, Greenland as North America, the
// Caribbean and Central America as North America.
(() => {
  const ggs = globalThis.__ggs;
  const LIST = {
    Europe:
      'ALB AND AUT BEL BGR BIH BLR CHE CYP CZE DEU DNK ESP EST FIN FRA FRO GBR GRC HRV HUN IMN IRL ISL ITA JEY LIE LTU LUX LVA MCO MDA MKD MLT MNE NLD NOR POL PRT ROU RUS SMR SRB SVK SVN SWE TUR UKR VAT',
    Asia: 'AFG ARE ARM AZE BGD BHR BRN BTN CHN CXR GEO HKG IDN IND IRN IRQ ISR JOR JPN KAZ KGZ KHM KOR KWT LAO LBN LKA MAC MDV MMR MNG MYS NPL OMN PAK PHL PRK PSE QAT SAU SGP SYR THA TJK TKM TLS TWN UZB VNM YEM',
    Africa:
      'AGO BDI BEN BFA BWA CAF CIV CMR COD COG COM CPV DJI DZA EGY ERI ETH GAB GHA GIN GMB GNB GNQ KEN LBR LBY LSO MAR MDG MLI MOZ MRT MUS MWI NAM NER NGA RWA SDN SEN SLE SOM SSD STP SWZ SYC TCD TGO TUN TZA UGA ZAF ZMB ZWE',
    'North America':
      'ATG BHS BLZ BMU BRB CAN CRI CUB CUW DMA DOM GRD GRL GTM HND HTI JAM KNA LCA MEX NIC PAN PRI SLV SPM TTO USA VCT VIR',
    'South America': 'ARG BOL BRA CHL COL ECU FLK GUY PER PRY SGS SUR URY VEN',
    Oceania: 'ASM AUS FJI FSM GUM KIR MHL MNP NRU NZL PCN PLW PNG SLB TON TUV VUT WSM',
  };
  ggs.CONTINENTS = {};
  for (const [name, codes] of Object.entries(LIST))
    for (const c of codes.split(' ')) ggs.CONTINENTS[c] = name;
})();
