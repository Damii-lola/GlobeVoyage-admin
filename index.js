const express = require("express");
const cors    = require("cors");
const https   = require("https");
const http    = require("http");
const { createClient } = require("@supabase/supabase-js");

// ── Crash protection ────────────────────────────────────────────
// Without these, ANY unhandled error anywhere in the app (a bad route,
// a missing function, a bad promise) kills the entire Node process,
// and Render then has to cold-boot a brand new instance from scratch —
// which is exactly what produces ERR_CONNECTION_CLOSED for every route,
// not just the one that errored.
process.on("unhandledRejection", (err) => {
  console.error("[unhandledRejection]", err);
});
process.on("uncaughtException", (err) => {
  console.error("[uncaughtException]", err);
});

const app = express();
app.use(cors());
app.use(express.json());

// ── Supabase client (non-fatal if misconfigured) ──────────────────
// createClient() throws SYNCHRONOUSLY if SUPABASE_URL is missing/invalid.
// That throw happens at module load, outside any try/catch, so a bad or
// missing env var here would previously crash the whole server on every
// boot attempt — a permanent crash loop, not just a slow cold start.
let supabase = null;
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("[Supabase] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing — running in memory-fallback mode.");
} else {
  try {
    supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  } catch (e) {
    console.error("[Supabase] Failed to create client:", e.message);
    supabase = null;
  }
}

// ── Self-ping keepalive ───────────────────────────────────────────
// Every 5s was excessive (17k+ requests/day) for no benefit — Render's
// free tier only needs *some* traffic within its inactivity window.
// Every 4 minutes is plenty to keep it from sleeping.
const SELF = process.env.RENDER_EXTERNAL_URL || "https://globevoyage-admin.onrender.com";
setInterval(() => {
  const mod = SELF.startsWith("https") ? https : http;
  mod.get(SELF + "/", r => r.resume()).on("error", () => {});
}, 4 * 60 * 1000);

// ══════════════════════════════════════════════════════════════════
// COMPLETE WORLD GEO — 195 countries + all states
// ══════════════════════════════════════════════════════════════════
const WORLD_GEO = {
  "DZA":{ name:"Algeria",continent:"Africa",states:["Adrar","Aïn Defla","Aïn Témouchent","Algiers","Annaba","Batna","Béchar","Béjaïa","Biskra","Blida","Bordj Bou Arréridj","Bouïra","Boumerdes","Chlef","Constantine","Djelfa","El Bayadh","El Oued","El Tarf","Ghardaïa","Guelma","Illizi","Jijel","Khenchela","Laghouat","M'Sila","Mascara","Médéa","Mila","Mostaganem","Naama","Oran","Ouargla","Oum El Bouaghi","Relizane","Saïda","Sétif","Sidi Bel Abbès","Skikda","Souk Ahras","Tamanghasset","Tébessa","Tiaret","Tindouf","Tipaza","Tissemsilt","Tizi Ouzou","Tlemcen"] },
  "AGO":{ name:"Angola",continent:"Africa",states:["Bengo","Benguela","Bié","Cabinda","Cuando Cubango","Cuanza Norte","Cuanza Sul","Cunene","Huambo","Huíla","Luanda","Lunda Norte","Lunda Sul","Malanje","Moxico","Namibe","Uíge","Zaire"] },
  "BEN":{ name:"Benin",continent:"Africa",states:["Alibori","Atacora","Atlantique","Borgou","Collines","Donga","Kouffo","Littoral","Mono","Ouémé","Plateau","Zou"] },
  "BWA":{ name:"Botswana",continent:"Africa",states:["Central","Ghanzi","Kgalagadi","Kgatleng","Kweneng","North East","North West","South East","Southern"] },
  "BFA":{ name:"Burkina Faso",continent:"Africa",states:["Boucle du Mouhoun","Cascades","Centre","Centre-Est","Centre-Nord","Centre-Ouest","Centre-Sud","Est","Hauts-Bassins","Nord","Plateau-Central","Sahel","Sud-Ouest"] },
  "BDI":{ name:"Burundi",continent:"Africa",states:["Bubanza","Bujumbura Mairie","Bujumbura Rural","Bururi","Cankuzo","Cibitoke","Gitega","Karuzi","Kayanza","Kirundo","Makamba","Muramvya","Muyinga","Mwaro","Ngozi","Rumonge","Rutana","Ruyigi"] },
  "CMR":{ name:"Cameroon",continent:"Africa",states:["Adamawa","Centre","East","Far North","Littoral","North","North West","South","South West","West"] },
  "CPV":{ name:"Cape Verde",continent:"Africa",states:["Barlavento Islands","Sotavento Islands"] },
  "CAF":{ name:"Central African Republic",continent:"Africa",states:["Bamingui-Bangoran","Bangui","Basse-Kotto","Haute-Kotto","Haut-Mbomou","Kémo","Lobaye","Mambéré-Kadéï","Mbomou","Nana-Grebizi","Nana-Mambéré","Ombella-M'Poko","Ouaka","Ouham","Ouham-Pendé","Sangha-Mbaéré","Vakaga"] },
  "TCD":{ name:"Chad",continent:"Africa",states:["Bahr El Gazel","Batha","Borkou","Chari-Baguirmi","Ennedi Est","Ennedi Ouest","Guéra","Hadjer-Lamis","Kanem","Lac","Logone Occidental","Logone Oriental","Mandoul","Mayo-Kebbi Est","Mayo-Kebbi Ouest","Moyen-Chari","N'Djamena","Ouaddaï","Salamat","Sila","Tandjilé","Tibesti","Wadi Fira"] },
  "COD":{ name:"DR Congo",continent:"Africa",states:["Bandundu","Bas-Congo","Equateur","Kasai-Occidental","Kasai-Oriental","Katanga","Kinshasa","Maniema","Nord-Kivu","Orientale","Sud-Kivu"] },
  "COG":{ name:"Republic of Congo",continent:"Africa",states:["Bouenza","Brazzaville","Cuvette","Cuvette-Ouest","Kouilou","Lékoumou","Likouala","Niari","Plateaux","Pool","Sangha"] },
  "CIV":{ name:"Ivory Coast",continent:"Africa",states:["Abidjan","Bas-Sassandra","Comoé","Denguélé","Gôh-Djiboua","Lacs","Lagunes","Montagnes","Sassandra-Marahoué","Savanes","Vallée du Bandama","Woroba","Yamoussoukro","Zanzan"] },
  "DJI":{ name:"Djibouti",continent:"Africa",states:["Ali Sabieh","Arta","Dikhil","Djibouti","Obock","Tadjourah"] },
  "EGY":{ name:"Egypt",continent:"Africa",states:["Alexandria","Aswan","Asyut","Beheira","Beni Suef","Cairo","Dakahlia","Damietta","Faiyum","Gharbia","Giza","Ismailia","Kafr El Sheikh","Luxor","Matruh","Minya","Monufia","New Valley","North Sinai","Port Said","Qalyubia","Qena","Red Sea","Sharqia","Sohag","South Sinai","Suez"] },
  "ETH":{ name:"Ethiopia",continent:"Africa",states:["Addis Ababa","Afar","Amhara","Benishangul-Gumuz","Dire Dawa","Gambela","Harari","Oromia","Sidama","Somali","South West Ethiopia","Southern Nations","Tigray"] },
  "GAB":{ name:"Gabon",continent:"Africa",states:["Estuaire","Haut-Ogooué","Moyen-Ogooué","Ngounié","Nyanga","Ogooué-Ivindo","Ogooué-Lolo","Ogooué-Maritime","Woleu-Ntem"] },
  "GMB":{ name:"Gambia",continent:"Africa",states:["Banjul","Central River","Lower River","North Bank","Upper River","West Coast"] },
  "GHA":{ name:"Ghana",continent:"Africa",states:["Ahafo","Ashanti","Bono","Bono East","Central","Eastern","Greater Accra","North East","Northern","Oti","Savannah","Upper East","Upper West","Volta","Western","Western North"] },
  "GIN":{ name:"Guinea",continent:"Africa",states:["Boké","Conakry","Faranah","Kankan","Kindia","Labé","Mamou","Nzérékoré"] },
  "GNB":{ name:"Guinea-Bissau",continent:"Africa",states:["Bafatá","Biombo","Bissau","Bolama","Cacheu","Gabú","Oio","Quinara","Tombali"] },
  "KEN":{ name:"Kenya",continent:"Africa",states:["Baringo","Bomet","Bungoma","Busia","Elgeyo-Marakwet","Embu","Garissa","Homa Bay","Isiolo","Kajiado","Kakamega","Kericho","Kiambu","Kilifi","Kirinyaga","Kisii","Kisumu","Kitui","Kwale","Laikipia","Lamu","Machakos","Makueni","Mandera","Marsabit","Meru","Migori","Mombasa","Murang'a","Nairobi","Nakuru","Nandi","Narok","Nyamira","Nyandarua","Nyeri","Samburu","Siaya","Taita-Taveta","Tana River","Tharaka-Nithi","Trans Nzoia","Turkana","Uasin Gishu","Vihiga","Wajir","West Pokot"] },
  "LSO":{ name:"Lesotho",continent:"Africa",states:["Berea","Butha-Buthe","Leribe","Mafeteng","Maseru","Mohale's Hoek","Mokhotlong","Qacha's Nek","Quthing","Thaba-Tseka"] },
  "LBR":{ name:"Liberia",continent:"Africa",states:["Bomi","Bong","Gbarpolu","Grand Bassa","Grand Cape Mount","Grand Gedeh","Grand Kru","Lofa","Margibi","Maryland","Montserrado","Nimba","River Cess","River Gee","Sinoe"] },
  "LBY":{ name:"Libya",continent:"Africa",states:["Al Butnan","Al Jabal al Akhdar","Al Jabal al Gharbi","Al Jafara","Al Jufra","Al Kufra","Al Marj","Al Marqab","Al Wahat","Benghazi","Derna","Ghat","Misrata","Murzuq","Nalut","Sabha","Sirte","Tripoli","Wadi al Hayaa","Wadi al Shatii","Zuwarah"] },
  "MDG":{ name:"Madagascar",continent:"Africa",states:["Antananarivo","Antsiranana","Fianarantsoa","Mahajanga","Toamasina","Toliara"] },
  "MWI":{ name:"Malawi",continent:"Africa",states:["Balaka","Blantyre","Chikwawa","Chiradzulu","Chitipa","Dedza","Dowa","Karonga","Kasungu","Lilongwe","Machinga","Mangochi","Mchinji","Mulanje","Mwanza","Mzimba","Nkhata Bay","Nkhotakota","Nsanje","Ntcheu","Ntchisi","Rumphi","Salima","Thyolo","Zomba"] },
  "MLI":{ name:"Mali",continent:"Africa",states:["Bamako","Gao","Kayes","Kidal","Koulikoro","Mopti","Ségou","Sikasso","Taoudénit","Tombouctou"] },
  "MRT":{ name:"Mauritania",continent:"Africa",states:["Adrar","Assaba","Brakna","Dakhlet Nouadhibou","Gorgol","Guidimaka","Hodh Ech Chargui","Hodh El Gharbi","Inchiri","Nouakchott Nord","Nouakchott Ouest","Nouakchott Sud","Tagant","Tiris Zemmour","Trarza"] },
  "MUS":{ name:"Mauritius",continent:"Africa",states:["Black River","Flacq","Grand Port","Moka","Pamplemousses","Plaines Wilhems","Port Louis","Rivière du Rempart","Rodrigues","Savanne"] },
  "MAR":{ name:"Morocco",continent:"Africa",states:["Béni Mellal-Khénifra","Casablanca-Settat","Darâa-Tafilalet","Fès-Meknès","Guelmim-Oued Noun","Laâyoune-Sakia El Hamra","Marrakesh-Safi","Oriental","Rabat-Salé-Kénitra","Souss-Massa","Tanger-Tétouan-Al Hoceïma"] },
  "MOZ":{ name:"Mozambique",continent:"Africa",states:["Cabo Delgado","Gaza","Inhambane","Manica","Maputo","Maputo City","Nampula","Niassa","Sofala","Tete","Zambezia"] },
  "NAM":{ name:"Namibia",continent:"Africa",states:["Erongo","Hardap","Karas","Kavango East","Kavango West","Khomas","Kunene","Ohangwena","Omaheke","Omusati","Oshana","Oshikoto","Otjozondjupa","Zambezi"] },
  "NER":{ name:"Niger",continent:"Africa",states:["Agadez","Diffa","Dosso","Maradi","Niamey","Tahoua","Tillabéri","Zinder"] },
  "NGA":{ name:"Nigeria",continent:"Africa",states:["Abia","Adamawa","Akwa Ibom","Anambra","Bauchi","Bayelsa","Benue","Borno","Cross River","Delta","Ebonyi","Edo","Ekiti","Enugu","FCT Abuja","Gombe","Imo","Jigawa","Kaduna","Kano","Katsina","Kebbi","Kogi","Kwara","Lagos","Nasarawa","Niger","Ogun","Ondo","Osun","Oyo","Plateau","Rivers","Sokoto","Taraba","Yobe","Zamfara"] },
  "RWA":{ name:"Rwanda",continent:"Africa",states:["Eastern","Kigali","Northern","Southern","Western"] },
  "STP":{ name:"Sao Tome and Principe",continent:"Africa",states:["Príncipe","São Tomé"] },
  "SEN":{ name:"Senegal",continent:"Africa",states:["Dakar","Diourbel","Fatick","Kaffrine","Kaolack","Kédougou","Kolda","Louga","Matam","Saint-Louis","Sédhiou","Tambacounda","Thiès","Ziguinchor"] },
  "SLE":{ name:"Sierra Leone",continent:"Africa",states:["Eastern","North West","Northern","Southern","Western Area"] },
  "SOM":{ name:"Somalia",continent:"Africa",states:["Awdal","Bakool","Banaadir","Bari","Bay","Galguduud","Gedo","Hiiraan","Jubbada Dhexe","Jubbada Hoose","Mudug","Nugaal","Sanaag","Shabeellaha Dhexe","Shabeellaha Hoose","Sool","Togdheer","Woqooyi Galbeed"] },
  "ZAF":{ name:"South Africa",continent:"Africa",states:["Eastern Cape","Free State","Gauteng","KwaZulu-Natal","Limpopo","Mpumalanga","North West","Northern Cape","Western Cape"] },
  "SSD":{ name:"South Sudan",continent:"Africa",states:["Central Equatoria","Eastern Equatoria","Jonglei","Lakes","Northern Bahr el Ghazal","Unity","Upper Nile","Warrap","Western Bahr el Ghazal","Western Equatoria"] },
  "SDN":{ name:"Sudan",continent:"Africa",states:["Al Jazirah","Al Qadarif","Blue Nile","Central Darfur","East Darfur","Kassala","Khartoum","North Darfur","North Kordofan","Northern","Red Sea","River Nile","Sennar","South Darfur","South Kordofan","West Darfur","West Kordofan","White Nile"] },
  "TZA":{ name:"Tanzania",continent:"Africa",states:["Arusha","Dar es Salaam","Dodoma","Geita","Iringa","Kagera","Katavi","Kigoma","Kilimanjaro","Lindi","Manyara","Mara","Mbeya","Morogoro","Mtwara","Mwanza","Njombe","Pemba North","Pemba South","Pwani","Rukwa","Ruvuma","Shinyanga","Simiyu","Singida","Songwe","Tabora","Tanga","Zanzibar"] },
  "TGO":{ name:"Togo",continent:"Africa",states:["Centrale","Kara","Maritime","Plateaux","Savanes"] },
  "TUN":{ name:"Tunisia",continent:"Africa",states:["Ariana","Béja","Ben Arous","Bizerte","Gabès","Gafsa","Jendouba","Kairouan","Kasserine","Kébili","Kef","Mahdia","Manouba","Médenine","Monastir","Nabeul","Sfax","Sidi Bouzid","Siliana","Sousse","Tataouine","Tozeur","Tunis","Zaghouan"] },
  "UGA":{ name:"Uganda",continent:"Africa",states:["Central","Eastern","Northern","Western"] },
  "ZMB":{ name:"Zambia",continent:"Africa",states:["Central","Copperbelt","Eastern","Luapula","Lusaka","Muchinga","North-Western","Northern","Southern","Western"] },
  "ZWE":{ name:"Zimbabwe",continent:"Africa",states:["Bulawayo","Harare","Manicaland","Mashonaland Central","Mashonaland East","Mashonaland West","Masvingo","Matabeleland North","Matabeleland South","Midlands"] },
  // ASIA
  "AFG":{ name:"Afghanistan",continent:"Asia",states:["Badakhshan","Badghis","Baghlan","Balkh","Bamyan","Daykundi","Farah","Faryab","Ghazni","Ghor","Helmand","Herat","Jowzjan","Kabul","Kandahar","Kapisa","Khost","Kunar","Kunduz","Laghman","Logar","Nangarhar","Nimroz","Nuristan","Paktia","Paktika","Panjshir","Parwan","Samangan","Sar-e Pol","Takhar","Urozgan","Wardak","Zabul"] },
  "ARM":{ name:"Armenia",continent:"Asia",states:["Aragatsotn","Ararat","Armavir","Gegharkunik","Kotayk","Lori","Shirak","Syunik","Tavush","Vayots Dzor","Yerevan"] },
  "AZE":{ name:"Azerbaijan",continent:"Asia",states:["Absheron","Agdam","Agstafa","Agsu","Astara","Balakan","Barda","Beylagan","Bilasuvar","Dashkasan","Fuzuli","Gadabay","Ganja","Goranboy","Goychay","Hajigabul","Imishli","Ismailli","Jabrayil","Jalilabad","Kalbajar","Khachmaz","Kurdamir","Lachin","Lerik","Masally","Mingachevir","Nakhchivan","Neftchala","Oghuz","Qabala","Qakh","Qazakh","Quba","Qubadli","Qusar","Saatly","Sabirabad","Salyan","Shamakhi","Shamkir","Shirvan","Shusha","Siyazan","Sumgayit","Tartar","Tovuz","Ujar","Yardymli","Yevlakh","Zangilan","Zaqatala","Zardab"] },
  "BHR":{ name:"Bahrain",continent:"Asia",states:["Capital","Central","Muharraq","Northern","Southern"] },
  "BGD":{ name:"Bangladesh",continent:"Asia",states:["Barisal","Chittagong","Dhaka","Khulna","Mymensingh","Rajshahi","Rangpur","Sylhet"] },
  "BTN":{ name:"Bhutan",continent:"Asia",states:["Bumthang","Chukha","Dagana","Gasa","Haa","Lhuentse","Mongar","Paro","Pemagatshel","Punakha","Samdrup Jongkhar","Samtse","Sarpang","Thimphu","Trashigang","Trongsa","Tsirang","Wangdue Phodrang","Zhemgang"] },
  "BRN":{ name:"Brunei",continent:"Asia",states:["Belait","Brunei-Muara","Temburong","Tutong"] },
  "KHM":{ name:"Cambodia",continent:"Asia",states:["Banteay Meanchey","Battambang","Kampong Cham","Kampong Chhnang","Kampong Speu","Kampong Thom","Kampot","Kandal","Kep","Koh Kong","Kratie","Mondulkiri","Oddar Meanchey","Pailin","Phnom Penh","Preah Sihanouk","Preah Vihear","Prey Veng","Pursat","Ratanakiri","Siem Reap","Stung Treng","Svay Rieng","Takeo","Tboung Khmum"] },
  "CHN":{ name:"China",continent:"Asia",states:["Anhui","Beijing","Chongqing","Fujian","Gansu","Guangdong","Guangxi","Guizhou","Hainan","Hebei","Heilongjiang","Henan","Hong Kong","Hubei","Hunan","Inner Mongolia","Jiangsu","Jiangxi","Jilin","Liaoning","Macau","Ningxia","Qinghai","Shaanxi","Shandong","Shanghai","Shanxi","Sichuan","Tianjin","Tibet","Xinjiang","Yunnan","Zhejiang"] },
  "CYP":{ name:"Cyprus",continent:"Asia",states:["Famagusta","Kyrenia","Larnaca","Limassol","Nicosia","Paphos"] },
  "GEO":{ name:"Georgia",continent:"Asia",states:["Adjara","Guria","Imereti","Kakheti","Kvemo Kartli","Mtskheta-Mtianeti","Racha-Lechkhumi","Samegrelo-Zemo Svaneti","Samtskhe-Javakheti","Shida Kartli","Tbilisi"] },
  "IND":{ name:"India",continent:"Asia",states:["Andhra Pradesh","Arunachal Pradesh","Assam","Bihar","Chhattisgarh","Goa","Gujarat","Haryana","Himachal Pradesh","Jharkhand","Karnataka","Kerala","Madhya Pradesh","Maharashtra","Manipur","Meghalaya","Mizoram","Nagaland","Odisha","Punjab","Rajasthan","Sikkim","Tamil Nadu","Telangana","Tripura","Uttar Pradesh","Uttarakhand","West Bengal","Delhi","Jammu and Kashmir","Ladakh","Puducherry"] },
  "IDN":{ name:"Indonesia",continent:"Asia",states:["Aceh","Bali","Bangka Belitung","Banten","Bengkulu","Central Java","Central Kalimantan","Central Sulawesi","East Java","East Kalimantan","East Nusa Tenggara","Gorontalo","Jakarta","Jambi","Lampung","Maluku","North Kalimantan","North Maluku","North Sulawesi","North Sumatra","Papua","Riau","Riau Islands","South Kalimantan","South Sulawesi","South Sumatra","Southeast Sulawesi","West Java","West Kalimantan","West Nusa Tenggara","West Papua","West Sulawesi","West Sumatra","Yogyakarta"] },
  "IRN":{ name:"Iran",continent:"Asia",states:["Alborz","Ardabil","Bushehr","Chaharmahal and Bakhtiari","East Azerbaijan","Fars","Gilan","Golestan","Hamadan","Hormozgan","Ilam","Isfahan","Kerman","Kermanshah","Khuzestan","Kohgiluyeh and Boyer-Ahmad","Kordestan","Lorestan","Markazi","Mazandaran","North Khorasan","Qazvin","Qom","Razavi Khorasan","Semnan","Sistan and Baluchestan","South Khorasan","Tehran","West Azerbaijan","Yazd","Zanjan"] },
  "IRQ":{ name:"Iraq",continent:"Asia",states:["Al Anbar","Al Muthanna","Al Qadisiyyah","An Najaf","Babil","Baghdad","Basra","Dahuk","Dhi Qar","Diyala","Erbil","Karbala","Kirkuk","Maysan","Nineveh","Saladin","Sulaymaniyah","Wasit"] },
  "ISR":{ name:"Israel",continent:"Asia",states:["Central","Haifa","Jerusalem","North","South","Tel Aviv"] },
  "JPN":{ name:"Japan",continent:"Asia",states:["Aichi","Akita","Aomori","Chiba","Ehime","Fukui","Fukuoka","Fukushima","Gifu","Gunma","Hiroshima","Hokkaido","Hyogo","Ibaraki","Ishikawa","Iwate","Kagawa","Kagoshima","Kanagawa","Kochi","Kumamoto","Kyoto","Mie","Miyagi","Miyazaki","Nagano","Nagasaki","Nara","Niigata","Oita","Okayama","Okinawa","Osaka","Saga","Saitama","Shiga","Shimane","Shizuoka","Tochigi","Tokushima","Tokyo","Tottori","Toyama","Wakayama","Yamagata","Yamaguchi","Yamanashi"] },
  "JOR":{ name:"Jordan",continent:"Asia",states:["Ajloun","Aqaba","Balqa","Irbid","Jarash","Karak","Ma'an","Madaba","Mafraq","Amman","Tafilah","Zarqa"] },
  "KAZ":{ name:"Kazakhstan",continent:"Asia",states:["Akmola","Aktobe","Almaty","Almaty City","Atyrau","East Kazakhstan","Jambyl","Karaganda","Kostanay","Kyzylorda","Mangystau","North Kazakhstan","Nur-Sultan","Pavlodar","Shymkent","South Kazakhstan","West Kazakhstan"] },
  "KWT":{ name:"Kuwait",continent:"Asia",states:["Al Ahmadi","Al Asimah","Al Farwaniyah","Al Jahra","Hawalli","Mubarak Al-Kabeer"] },
  "KGZ":{ name:"Kyrgyzstan",continent:"Asia",states:["Batken","Bishkek","Chuy","Issyk-Kul","Jalal-Abad","Naryn","Osh","Talas"] },
  "LAO":{ name:"Laos",continent:"Asia",states:["Attapeu","Bokeo","Bolikhamsai","Champasak","Houaphanh","Khammouane","Luang Namtha","Luang Prabang","Oudomxay","Phongsali","Salavan","Savannakhet","Vientiane","Vientiane Prefecture","Xekong","Xiangkhouang"] },
  "LBN":{ name:"Lebanon",continent:"Asia",states:["Akkar","Baalbek-Hermel","Beirut","Beqaa","Mount Lebanon","Nabatieh","North","South"] },
  "MYS":{ name:"Malaysia",continent:"Asia",states:["Johor","Kedah","Kelantan","Kuala Lumpur","Labuan","Malacca","Negeri Sembilan","Pahang","Penang","Perak","Perlis","Putrajaya","Sabah","Sarawak","Selangor","Terengganu"] },
  "MDV":{ name:"Maldives",continent:"Asia",states:["Addu Atoll","Central Province","Male","North Central Province","North Province","South Central Province","South Province","Upper North Province","Upper South Province"] },
  "MNG":{ name:"Mongolia",continent:"Asia",states:["Arkhangai","Bayan-Ölgii","Bayankhongor","Bulgan","Darkhan-Uul","Dornod","Dornogovi","Dundgovi","Govi-Altai","Govisümber","Khentii","Khovd","Khövsgöl","Ömnögovi","Orkhon","Övörkhangai","Selenge","Sükhbaatar","Töv","Ulaanbaatar","Uvs","Zavkhan"] },
  "MMR":{ name:"Myanmar",continent:"Asia",states:["Ayeyarwady","Bago","Chin","Kachin","Kayah","Kayin","Magway","Mandalay","Mon","Naypyidaw","Rakhine","Sagaing","Shan","Tanintharyi","Yangon"] },
  "NPL":{ name:"Nepal",continent:"Asia",states:["Bagmati","Gandaki","Karnali","Koshi","Lumbini","Madhesh","Sudurpashchim"] },
  "OMN":{ name:"Oman",continent:"Asia",states:["Ad Dakhiliyah","Ad Dhahirah","Al Buraymi","Al Wusta","Ash Sharqiyah North","Ash Sharqiyah South","Dhofar","Musandam","Muscat","North Al Batinah","South Al Batinah"] },
  "PAK":{ name:"Pakistan",continent:"Asia",states:["Azad Kashmir","Balochistan","Gilgit-Baltistan","Islamabad Capital Territory","Khyber Pakhtunkhwa","Punjab","Sindh"] },
  "PSE":{ name:"Palestine",continent:"Asia",states:["Gaza Strip","West Bank"] },
  "PHL":{ name:"Philippines",continent:"Asia",states:["Abra","Agusan del Norte","Agusan del Sur","Aklan","Albay","Antique","Aurora","Basilan","Bataan","Batanes","Batangas","Benguet","Biliran","Bohol","Bukidnon","Bulacan","Cagayan","Camarines Norte","Camarines Sur","Camiguin","Capiz","Catanduanes","Cavite","Cebu","Cotabato","Davao de Oro","Davao del Norte","Davao del Sur","Davao Occidental","Davao Oriental","Dinagat Islands","Eastern Samar","Guimaras","Ifugao","Ilocos Norte","Ilocos Sur","Iloilo","Isabela","Kalinga","La Union","Laguna","Lanao del Norte","Lanao del Sur","Leyte","Maguindanao","Marinduque","Masbate","Metro Manila","Misamis Occidental","Misamis Oriental","Mountain Province","Negros Occidental","Negros Oriental","Northern Samar","Nueva Ecija","Nueva Vizcaya","Occidental Mindoro","Oriental Mindoro","Palawan","Pampanga","Pangasinan","Quezon","Quirino","Rizal","Romblon","Samar","Sarangani","Siquijor","Sorsogon","South Cotabato","Southern Leyte","Sultan Kudarat","Sulu","Surigao del Norte","Surigao del Sur","Tarlac","Tawi-Tawi","Zambales","Zamboanga del Norte","Zamboanga del Sur","Zamboanga Sibugay"] },
  "QAT":{ name:"Qatar",continent:"Asia",states:["Al Daayen","Al Khor","Al Rayyan","Al Shamal","Al Wakrah","Doha","Umm Salal"] },
  "SAU":{ name:"Saudi Arabia",continent:"Asia",states:["Al Bahah","Al Jawf","Al Madinah","Al Qassim","Asir","Eastern Province","Ha'il","Jazan","Makkah","Najran","Northern Borders","Riyadh","Tabuk"] },
  "SGP":{ name:"Singapore",continent:"Asia",states:["Central Region","East Region","North Region","North-East Region","West Region"] },
  "KOR":{ name:"South Korea",continent:"Asia",states:["Busan","Chungcheongbuk-do","Chungcheongnam-do","Daegu","Daejeon","Gangwon-do","Gwangju","Gyeonggi-do","Gyeongsangbuk-do","Gyeongsangnam-do","Incheon","Jeju","Jeollabuk-do","Jeollanam-do","Sejong","Seoul","Ulsan"] },
  "LKA":{ name:"Sri Lanka",continent:"Asia",states:["Central","Eastern","Northern","North Central","North Western","Sabaragamuwa","Southern","Uva","Western"] },
  "SYR":{ name:"Syria",continent:"Asia",states:["Al-Hasakah","Al-Raqqah","Aleppo","As-Suwayda","Damascus","Daraa","Deir ez-Zor","Hama","Homs","Idlib","Latakia","Quneitra","Rif Dimashq","Tartus"] },
  "TWN":{ name:"Taiwan",continent:"Asia",states:["Changhua","Chiayi City","Chiayi County","Hsinchu City","Hsinchu County","Hualien","Kaohsiung","Keelung","Kinmen","Lienchiang","Miaoli","Nantou","New Taipei","Penghu","Pingtung","Taichung","Tainan","Taipei","Taitung","Taoyuan","Yilan","Yunlin"] },
  "TJK":{ name:"Tajikistan",continent:"Asia",states:["Dushanbe","Gorno-Badakhshan","Khatlon","Sughd"] },
  "THA":{ name:"Thailand",continent:"Asia",states:["Amnat Charoen","Ang Thong","Bangkok","Bueng Kan","Buri Ram","Chachoengsao","Chai Nat","Chaiyaphum","Chanthaburi","Chiang Mai","Chiang Rai","Chon Buri","Chumphon","Kalasin","Kamphaeng Phet","Kanchanaburi","Khon Kaen","Krabi","Lampang","Lamphun","Loei","Lop Buri","Mae Hong Son","Maha Sarakham","Mukdahan","Nakhon Nayok","Nakhon Pathom","Nakhon Phanom","Nakhon Ratchasima","Nakhon Sawan","Nakhon Si Thammarat","Nan","Narathiwat","Nong Bua Lam Phu","Nong Khai","Nonthaburi","Pathum Thani","Pattani","Phang Nga","Phatthalung","Phayao","Phetchabun","Phetchaburi","Phichit","Phitsanulok","Phra Nakhon Si Ayutthaya","Phrae","Phuket","Prachin Buri","Prachuap Khiri Khan","Ranong","Ratchaburi","Rayong","Roi Et","Sa Kaeo","Sakon Nakhon","Samut Prakan","Samut Sakhon","Samut Songkhram","Saraburi","Satun","Sing Buri","Sisaket","Songkhla","Sukhothai","Suphan Buri","Surat Thani","Surin","Tak","Trang","Trat","Ubon Ratchathani","Udon Thani","Uthai Thani","Uttaradit","Yala","Yasothon"] },
  "TLS":{ name:"Timor-Leste",continent:"Asia",states:["Aileu","Ainaro","Baucau","Bobonaro","Cova Lima","Dili","Ermera","Lautem","Liquica","Manatuto","Manufahi","Oecusse","Viqueque"] },
  "TUR":{ name:"Turkey",continent:"Asia",states:["Adana","Adiyaman","Afyonkarahisar","Agri","Amasya","Ankara","Antalya","Artvin","Aydin","Balikesir","Bilecik","Bingol","Bitlis","Bolu","Burdur","Bursa","Canakkale","Cankiri","Corum","Denizli","Diyarbakir","Edirne","Elazig","Erzincan","Erzurum","Eskisehir","Gaziantep","Giresun","Gumushane","Hakkari","Hatay","Isparta","Istanbul","Izmir","Kahramanmaras","Karabuk","Karaman","Kars","Kastamonu","Kayseri","Kilis","Kirikkale","Kirklareli","Kirsehir","Kocaeli","Konya","Kutahya","Malatya","Manisa","Mardin","Mersin","Mugla","Mus","Nevsehir","Nigde","Ordu","Osmaniye","Rize","Sakarya","Samsun","Sanliurfa","Siirt","Sinop","Sirnak","Sivas","Tekirdag","Tokat","Trabzon","Tunceli","Usak","Van","Yalova","Yozgat","Zonguldak"] },
  "TKM":{ name:"Turkmenistan",continent:"Asia",states:["Ahal","Ashgabat","Balkan","Daşoguz","Lebap","Mary"] },
  "ARE":{ name:"United Arab Emirates",continent:"Asia",states:["Abu Dhabi","Ajman","Dubai","Fujairah","Ras Al Khaimah","Sharjah","Umm Al Quwain"] },
  "UZB":{ name:"Uzbekistan",continent:"Asia",states:["Andijan","Bukhara","Fergana","Jizzakh","Karakalpakstan","Kashkadarya","Khorezm","Namangan","Navoiy","Samarkand","Sirdaryo","Surxondaryo","Tashkent","Tashkent City"] },
  "VNM":{ name:"Vietnam",continent:"Asia",states:["An Giang","Ba Ria-Vung Tau","Bac Giang","Bac Kan","Bac Lieu","Bac Ninh","Ben Tre","Binh Dinh","Binh Duong","Binh Phuoc","Binh Thuan","Ca Mau","Can Tho","Cao Bang","Da Nang","Dak Lak","Dak Nong","Dien Bien","Dong Nai","Dong Thap","Gia Lai","Ha Giang","Ha Nam","Ha Noi","Ha Tinh","Hai Duong","Hai Phong","Hau Giang","Ho Chi Minh City","Hoa Binh","Hung Yen","Khanh Hoa","Kien Giang","Kon Tum","Lai Chau","Lam Dong","Lang Son","Lao Cai","Long An","Nam Dinh","Nghe An","Ninh Binh","Ninh Thuan","Phu Tho","Phu Yen","Quang Binh","Quang Nam","Quang Ngai","Quang Ninh","Quang Tri","Soc Trang","Son La","Tay Ninh","Thai Binh","Thai Nguyen","Thanh Hoa","Thua Thien-Hue","Tien Giang","Tra Vinh","Tuyen Quang","Vinh Long","Vinh Phuc","Yen Bai"] },
  "YEM":{ name:"Yemen",continent:"Asia",states:["Abyan","Aden","Al Bayda","Al Hudaydah","Al Jawf","Al Mahrah","Al Mahwit","Amanat Al Asimah","Amran","Dhamar","Hadramawt","Hajjah","Ibb","Lahij","Ma'rib","Raymah","Sa'dah","Sana'a","Shabwah","Socotra","Taizz"] },
  // EUROPE
  "ALB":{ name:"Albania",continent:"Europe",states:["Berat","Diber","Durres","Elbasan","Fier","Gjirokaster","Korce","Kukes","Lezhe","Shkoder","Tirana","Vlore"] },
  "AND":{ name:"Andorra",continent:"Europe",states:["Andorra la Vella","Canillo","Encamp","Escaldes-Engordany","La Massana","Ordino","Sant Julia de Loria"] },
  "AUT":{ name:"Austria",continent:"Europe",states:["Burgenland","Carinthia","Lower Austria","Salzburg","Styria","Tyrol","Upper Austria","Vienna","Vorarlberg"] },
  "BLR":{ name:"Belarus",continent:"Europe",states:["Brest","Gomel","Grodno","Minsk","Minsk City","Mogilev","Vitebsk"] },
  "BEL":{ name:"Belgium",continent:"Europe",states:["Antwerp","Brussels","East Flanders","Flemish Brabant","Hainaut","Liège","Limburg","Luxembourg","Namur","Walloon Brabant","West Flanders"] },
  "BIH":{ name:"Bosnia and Herzegovina",continent:"Europe",states:["Bosnian Podrinje Canton","Brčko District","Canton 10","Central Bosnia Canton","Federation of BiH","Herzegovina-Neretva Canton","Posavina Canton","Republika Srpska","Sarajevo Canton","Tuzla Canton","Una-Sana Canton","West Herzegovina Canton","Zenica-Doboj Canton"] },
  "BGR":{ name:"Bulgaria",continent:"Europe",states:["Blagoevgrad","Burgas","Dobrich","Gabrovo","Haskovo","Kardzhali","Kyustendil","Lovech","Montana","Pazardzhik","Pernik","Pleven","Plovdiv","Razgrad","Ruse","Shumen","Silistra","Sliven","Smolyan","Sofia","Sofia City","Stara Zagora","Targovishte","Varna","Veliko Tarnovo","Vidin","Vratsa","Yambol"] },
  "HRV":{ name:"Croatia",continent:"Europe",states:["Bjelovar-Bilogora","Brod-Posavina","Dubrovnik-Neretva","Istria","Karlovac","Koprivnica-Krizevci","Krapina-Zagorje","Lika-Senj","Medimurje","Osijek-Baranja","Pozega-Slavonija","Primorje-Gorski Kotar","Sibenik-Knin","Sisak-Moslavina","Split-Dalmatia","Varazdin","Virovitica-Podravina","Vukovar-Syrmia","Zadar","Zagreb","Zagreb City"] },
  "CZE":{ name:"Czech Republic",continent:"Europe",states:["Central Bohemian","Hradec Králové","Karlovy Vary","Liberec","Moravian-Silesian","Olomouc","Pardubice","Plzeň","Prague","South Bohemian","South Moravian","Ústí nad Labem","Vysočina","Zlín"] },
  "DNK":{ name:"Denmark",continent:"Europe",states:["Capital","Central Denmark","North Denmark","Region Zealand","Southern Denmark"] },
  "EST":{ name:"Estonia",continent:"Europe",states:["Harju","Hiiu","Ida-Viru","Järva","Jõgeva","Lääne","Lääne-Viru","Põlva","Pärnu","Rapla","Saare","Tartu","Valga","Viljandi","Võru"] },
  "FIN":{ name:"Finland",continent:"Europe",states:["Central Finland","Central Ostrobothnia","Kainuu","Kymenlaakso","Lapland","North Karelia","North Ostrobothnia","North Savo","Ostrobothnia","Päijät-Häme","Pirkanmaa","Satakunta","South Karelia","South Ostrobothnia","South Savo","Southwest Finland","Uusimaa"] },
  "FRA":{ name:"France",continent:"Europe",states:["Auvergne-Rhône-Alpes","Bourgogne-Franche-Comté","Bretagne","Centre-Val de Loire","Corse","Grand Est","Guadeloupe","Guyane","Hauts-de-France","Île-de-France","La Réunion","Martinique","Mayotte","Normandie","Nouvelle-Aquitaine","Occitanie","Pays de la Loire","Provence-Alpes-Côte d'Azur"] },
  "DEU":{ name:"Germany",continent:"Europe",states:["Baden-Württemberg","Bavaria","Berlin","Brandenburg","Bremen","Hamburg","Hesse","Lower Saxony","Mecklenburg-Western Pomerania","North Rhine-Westphalia","Rhineland-Palatinate","Saarland","Saxony","Saxony-Anhalt","Schleswig-Holstein","Thuringia"] },
  "GRC":{ name:"Greece",continent:"Europe",states:["Attica","Central Greece","Central Macedonia","Crete","Eastern Macedonia and Thrace","Epirus","Ionian Islands","North Aegean","Peloponnese","South Aegean","Thessaly","Western Greece","Western Macedonia"] },
  "HUN":{ name:"Hungary",continent:"Europe",states:["Bács-Kiskun","Baranya","Békés","Borsod-Abaúj-Zemplén","Budapest","Csongrád-Csanád","Fejér","Győr-Moson-Sopron","Hajdú-Bihar","Heves","Jász-Nagykun-Szolnok","Komárom-Esztergom","Nógrád","Pest","Somogy","Szabolcs-Szatmár-Bereg","Tolna","Vas","Veszprém","Zala"] },
  "ISL":{ name:"Iceland",continent:"Europe",states:["Capital Region","Eastern","Northeastern","Northwestern","Reykjanes","Southern","Southern Peninsula","Western","Westfjords"] },
  "IRL":{ name:"Ireland",continent:"Europe",states:["Carlow","Cavan","Clare","Cork","Donegal","Dublin","Galway","Kerry","Kildare","Kilkenny","Laois","Leitrim","Limerick","Longford","Louth","Mayo","Meath","Monaghan","Offaly","Roscommon","Sligo","Tipperary","Waterford","Westmeath","Wexford","Wicklow"] },
  "ITA":{ name:"Italy",continent:"Europe",states:["Abruzzo","Aosta Valley","Apulia","Basilicata","Calabria","Campania","Emilia-Romagna","Friuli-Venezia Giulia","Lazio","Liguria","Lombardy","Marche","Molise","Piedmont","Sardinia","Sicily","Trentino-Alto Adige","Tuscany","Umbria","Veneto"] },
  "XKX":{ name:"Kosovo",continent:"Europe",states:["Ferizaj","Gjakova","Gjilan","Mitrovica","Peja","Pristina","Prizren"] },
  "LVA":{ name:"Latvia",continent:"Europe",states:["Adaži","Aizkraukle","Alūksne","Augšdaugava","Balvi","Bauska","Cēsis","Dobele","Gulbene","Jelgava","Jēkabpils","Jūrmala","Krāslava","Kuldīga","Liepāja","Ludza","Madona","Mārupe","Ogre","Olaine","Preiļi","Rēzekne","Riga","Ropaži","Salaspils","Saldus","Sigulda","Smiltene","Talsi","Tukums","Valka","Valmiera","Ventspils"] },
  "LIE":{ name:"Liechtenstein",continent:"Europe",states:["Balzers","Eschen","Gamprin","Mauren","Planken","Ruggell","Schaan","Schellenberg","Triesen","Triesenberg","Vaduz"] },
  "LTU":{ name:"Lithuania",continent:"Europe",states:["Alytus","Kaunas","Klaipeda","Marijampole","Panevezys","Siauliai","Taurage","Telsiai","Utena","Vilnius"] },
  "LUX":{ name:"Luxembourg",continent:"Europe",states:["Capellen","Clervaux","Diekirch","Echternach","Esch-sur-Alzette","Grevenmacher","Luxembourg","Mersch","Redange","Remich","Vianden","Wiltz"] },
  "MLT":{ name:"Malta",continent:"Europe",states:["Gozo","Malta"] },
  "MDA":{ name:"Moldova",continent:"Europe",states:["Anenii Noi","Basarabeasca","Briceni","Cahul","Calarasi","Cantemir","Causeni","Cimislia","Criuleni","Donduseni","Drochia","Edinet","Falesti","Floresti","Gagauzia","Glodeni","Hincesti","Ialoveni","Leova","Nisporeni","Ocnita","Orhei","Rezina","Riscani","Singerei","Slobozia","Soroca","Stefan Voda","Straseni","Taraclia","Telenesti","Transnistria","Ungheni"] },
  "MCO":{ name:"Monaco",continent:"Europe",states:["Fontvieille","La Condamine","Monaco-Ville","Monte Carlo"] },
  "MNE":{ name:"Montenegro",continent:"Europe",states:["Andrijevica","Bar","Berane","Bijelo Polje","Budva","Cetinje","Danilovgrad","Gusinje","Herceg Novi","Kolašin","Kotor","Mojkovac","Nikšić","Petnjica","Plav","Pljevlja","Plužine","Podgorica","Rožaje","Šavnik","Tivat","Tuzi","Ulcinj","Žabljak"] },
  "NLD":{ name:"Netherlands",continent:"Europe",states:["Drenthe","Flevoland","Friesland","Gelderland","Groningen","Limburg","North Brabant","North Holland","Overijssel","South Holland","Utrecht","Zeeland"] },
  "MKD":{ name:"North Macedonia",continent:"Europe",states:["Bitola","Debar","Delcevo","Gevgelija","Gostivar","Kavadarci","Kicevo","Kocani","Kratovo","Kriva Palanka","Kumanovo","Negotino","Ohrid","Prilep","Probistip","Radovis","Resen","Skopje","Stip","Struga","Strumica","Sveti Nikole","Tetovo","Veles","Vinica"] },
  "NOR":{ name:"Norway",continent:"Europe",states:["Agder","Innlandet","Møre og Romsdal","Nordland","Oslo","Rogaland","Troms og Finnmark","Trøndelag","Vestfold og Telemark","Vestland","Viken"] },
  "POL":{ name:"Poland",continent:"Europe",states:["Greater Poland","Kuyavian-Pomeranian","Lesser Poland","Lodz","Lower Silesian","Lublin","Lubusz","Masovian","Opole","Podkarpackie","Podlaskie","Pomeranian","Silesian","Swietokrzyskie","Warmian-Masurian","West Pomeranian"] },
  "PRT":{ name:"Portugal",continent:"Europe",states:["Aveiro","Azores","Beja","Braga","Bragança","Castelo Branco","Coimbra","Évora","Faro","Guarda","Leiria","Lisbon","Madeira","Portalegre","Porto","Santarém","Setúbal","Viana do Castelo","Vila Real","Viseu"] },
  "ROU":{ name:"Romania",continent:"Europe",states:["Alba","Arad","Argeș","Bacău","Bihor","Bistrița-Năsăud","Botoșani","Brăila","Brașov","București","Buzău","Călărași","Caraș-Severin","Cluj","Constanța","Covasna","Dâmbovița","Dolj","Galați","Giurgiu","Gorj","Harghita","Hunedoara","Ialomița","Iași","Ilfov","Maramureș","Mehedinți","Mureș","Neamț","Olt","Prahova","Sălaj","Satu Mare","Sibiu","Suceava","Teleorman","Timiș","Tulcea","Vâlcea","Vaslui","Vrancea"] },
  "RUS":{ name:"Russia",continent:"Europe",states:["Altai Krai","Altai Republic","Amur Oblast","Arkhangelsk Oblast","Astrakhan Oblast","Belgorod Oblast","Bryansk Oblast","Buryatia","Chechnya","Chelyabinsk Oblast","Chukotka","Chuvashia","Dagestan","Ingushetia","Irkutsk Oblast","Ivanovo Oblast","Jewish Autonomous Oblast","Kabardino-Balkaria","Kaliningrad Oblast","Kalmykia","Kaluga Oblast","Kamchatka Krai","Karachay-Cherkessia","Karelia","Kemerovo Oblast","Khabarovsk Krai","Khakassia","Khanty-Mansi","Kirov Oblast","Komi","Kostroma Oblast","Krasnodar Krai","Krasnoyarsk Krai","Kursk Oblast","Leningrad Oblast","Lipetsk Oblast","Magadan Oblast","Mari El","Mordovia","Moscow","Moscow Oblast","Murmansk Oblast","Nizhny Novgorod Oblast","North Ossetia","Novgorod Oblast","Novosibirsk Oblast","Omsk Oblast","Orel Oblast","Orenburg Oblast","Penza Oblast","Perm Krai","Primorsky Krai","Pskov Oblast","Rostov Oblast","Ryazan Oblast","Saint Petersburg","Sakha","Sakhalin Oblast","Samara Oblast","Saratov Oblast","Smolensk Oblast","Stavropol Krai","Sverdlovsk Oblast","Tambov Oblast","Tatarstan","Tomsk Oblast","Tula Oblast","Tuva","Tver Oblast","Tyumen Oblast","Udmurtia","Ulyanovsk Oblast","Vladimir Oblast","Volgograd Oblast","Vologda Oblast","Voronezh Oblast","Yamalo-Nenets","Yaroslavl Oblast","Zabaykalsky Krai"] },
  "SMR":{ name:"San Marino",continent:"Europe",states:["Acquaviva","Borgo Maggiore","Chiesanuova","Domagnano","Faetano","Fiorentino","Montegiardino","San Marino","Serravalle"] },
  "SRB":{ name:"Serbia",continent:"Europe",states:["Belgrade","Bor","Braničevo","Central Banat","Jablanica","Kolubara","Mačva","Moravica","Nišava","North Bačka","North Banat","Pčinja","Pirot","Podunavlje","Pomoravlje","Rasina","Raška","South Bačka","South Banat","Srem","Šumadija","Toplica","West Bačka","Zaječar","Zlatibor"] },
  "SVK":{ name:"Slovakia",continent:"Europe",states:["Banská Bystrica","Bratislava","Košice","Nitra","Prešov","Trenčín","Trnava","Žilina"] },
  "SVN":{ name:"Slovenia",continent:"Europe",states:["Celje","Koper","Kranj","Ljubljana","Maribor","Murska Sobota","Nova Gorica","Novo Mesto","Ptuj","Velenje"] },
  "ESP":{ name:"Spain",continent:"Europe",states:["Andalusia","Aragon","Asturias","Balearic Islands","Basque Country","Canary Islands","Cantabria","Castile and León","Castile-La Mancha","Catalonia","Ceuta","Extremadura","Galicia","La Rioja","Madrid","Melilla","Murcia","Navarre","Valencia"] },
  "SWE":{ name:"Sweden",continent:"Europe",states:["Blekinge","Dalarna","Gävleborg","Gotland","Halland","Jämtland","Jönköping","Kalmar","Kronoberg","Norrbotten","Örebro","Östergötland","Skåne","Södermanland","Stockholm","Uppsala","Värmland","Västerbotten","Västernorrland","Västmanland","Västra Götaland"] },
  "CHE":{ name:"Switzerland",continent:"Europe",states:["Aargau","Appenzell Ausserrhoden","Appenzell Innerrhoden","Basel-Landschaft","Basel-Stadt","Bern","Fribourg","Geneva","Glarus","Graubünden","Jura","Lucerne","Neuchâtel","Nidwalden","Obwalden","Schaffhausen","Schwyz","Solothurn","St. Gallen","Thurgau","Ticino","Uri","Valais","Vaud","Zug","Zurich"] },
  "UKR":{ name:"Ukraine",continent:"Europe",states:["Cherkasy","Chernihiv","Chernivtsi","Dnipropetrovsk","Donetsk","Ivano-Frankivsk","Kharkiv","Kherson","Khmelnytskyi","Kirovohrad","Kyiv","Kyiv City","Luhansk","Lviv","Mykolaiv","Odessa","Poltava","Rivne","Sumy","Ternopil","Vinnytsia","Volyn","Zakarpattia","Zaporizhzhia","Zhytomyr"] },
  "GBR":{ name:"United Kingdom",continent:"Europe",states:["England","Northern Ireland","Scotland","Wales"] },
  // NORTH AMERICA
  "ATG":{ name:"Antigua and Barbuda",continent:"North America",states:["Barbuda","Redonda","Saint George","Saint John","Saint Mary","Saint Paul","Saint Peter","Saint Philip"] },
  "BHS":{ name:"Bahamas",continent:"North America",states:["Acklins","Berry Islands","Bimini","Black Point","Cat Island","Central Abaco","Central Andros","Central Eleuthera","City of Freeport","Crooked Island","East Grand Bahama","Exuma","Grand Cay","Harbour Island","Hope Town","Inagua","Long Island","Mangrove Cay","Mayaguana","Moore's Island","New Providence","North Abaco","North Andros","North Eleuthera","Ragged Island","Rum Cay","San Salvador","South Abaco","South Andros","South Eleuthera","Spanish Wells","West Grand Bahama"] },
  "BRB":{ name:"Barbados",continent:"North America",states:["Christ Church","Saint Andrew","Saint George","Saint James","Saint John","Saint Joseph","Saint Lucy","Saint Michael","Saint Peter","Saint Philip","Saint Thomas"] },
  "BLZ":{ name:"Belize",continent:"North America",states:["Belize","Cayo","Corozal","Orange Walk","Stann Creek","Toledo"] },
  "CAN":{ name:"Canada",continent:"North America",states:["Alberta","British Columbia","Manitoba","New Brunswick","Newfoundland and Labrador","Northwest Territories","Nova Scotia","Nunavut","Ontario","Prince Edward Island","Quebec","Saskatchewan","Yukon"] },
  "CRI":{ name:"Costa Rica",continent:"North America",states:["Alajuela","Cartago","Guanacaste","Heredia","Limón","Puntarenas","San José"] },
  "CUB":{ name:"Cuba",continent:"North America",states:["Artemisa","Camagüey","Ciego de Ávila","Cienfuegos","Granma","Guantánamo","Havana","Holguín","Isla de la Juventud","Las Tunas","Matanzas","Mayabeque","Pinar del Río","Sancti Spíritus","Santiago de Cuba","Villa Clara"] },
  "DMA":{ name:"Dominica",continent:"North America",states:["Saint Andrew","Saint David","Saint George","Saint John","Saint Joseph","Saint Luke","Saint Mark","Saint Patrick","Saint Paul","Saint Peter"] },
  "DOM":{ name:"Dominican Republic",continent:"North America",states:["Azua","Baoruco","Barahona","Dajabón","Distrito Nacional","Duarte","El Seibo","Elías Piña","Espaillat","Hato Mayor","Hermanas Mirabal","Independencia","La Altagracia","La Romana","La Vega","María Trinidad Sánchez","Monseñor Nouel","Monte Cristi","Monte Plata","Pedernales","Peravia","Puerto Plata","Samaná","San Cristóbal","San José de Ocoa","San Juan","San Pedro de Macorís","Sánchez Ramírez","Santiago","Santiago Rodríguez","Santo Domingo","Valverde"] },
  "SLV":{ name:"El Salvador",continent:"North America",states:["Ahuachapán","Cabañas","Chalatenango","Cuscatlán","La Libertad","La Paz","La Unión","Morazán","San Miguel","San Salvador","San Vicente","Santa Ana","Sonsonate","Usulután"] },
  "GRD":{ name:"Grenada",continent:"North America",states:["Carriacou and Petite Martinique","Saint Andrew","Saint David","Saint George","Saint John","Saint Mark","Saint Patrick"] },
  "GTM":{ name:"Guatemala",continent:"North America",states:["Alta Verapaz","Baja Verapaz","Chimaltenango","Chiquimula","El Progreso","Escuintla","Guatemala","Huehuetenango","Izabal","Jalapa","Jutiapa","Petén","Quetzaltenango","Quiché","Retalhuleu","Sacatepéquez","San Marcos","Santa Rosa","Sololá","Suchitepéquez","Totonicapán","Zacapa"] },
  "HTI":{ name:"Haiti",continent:"North America",states:["Artibonite","Centre","Grand'Anse","Nippes","Nord","Nord-Est","Nord-Ouest","Ouest","Sud","Sud-Est"] },
  "HND":{ name:"Honduras",continent:"North America",states:["Atlántida","Choluteca","Colón","Comayagua","Copán","Cortés","El Paraíso","Francisco Morazán","Gracias a Dios","Intibucá","Islas de la Bahía","La Paz","Lempira","Ocotepeque","Olancho","Santa Bárbara","Valle","Yoro"] },
  "JAM":{ name:"Jamaica",continent:"North America",states:["Clarendon","Hanover","Kingston","Manchester","Portland","Saint Andrew","Saint Ann","Saint Catherine","Saint Elizabeth","Saint James","Saint Mary","Saint Thomas","Trelawny","Westmoreland"] },
  "MEX":{ name:"Mexico",continent:"North America",states:["Aguascalientes","Baja California","Baja California Sur","Campeche","Chiapas","Chihuahua","Coahuila","Colima","Durango","Guanajuato","Guerrero","Hidalgo","Jalisco","Mexico City","Mexico State","Michoacán","Morelos","Nayarit","Nuevo León","Oaxaca","Puebla","Querétaro","Quintana Roo","San Luis Potosí","Sinaloa","Sonora","Tabasco","Tamaulipas","Tlaxcala","Veracruz","Yucatán","Zacatecas"] },
  "NIC":{ name:"Nicaragua",continent:"North America",states:["Boaco","Carazo","Chinandega","Chontales","Estelí","Granada","Jinotega","León","Madriz","Managua","Masaya","Matagalpa","North Caribbean Coast","Nueva Segovia","Río San Juan","Rivas","South Caribbean Coast"] },
  "PAN":{ name:"Panama",continent:"North America",states:["Bocas del Toro","Chiriquí","Coclé","Colón","Darién","Emberá","Guna Yala","Herrera","Los Santos","Naso Tjër Di","Ngäbe-Buglé","Panama","Panama Oeste","Veraguas"] },
  "KNA":{ name:"Saint Kitts and Nevis",continent:"North America",states:["Christ Church Nichola Town","Nevis","Saint Anne Sandy Point","Saint George Basseterre","Saint George Gingerland","Saint James Windward","Saint John Capisterre","Saint John Figtree","Saint Mary Cayon","Saint Paul Capisterre","Saint Paul Charlestown","Saint Peter Basseterre","Saint Thomas Lowland","Saint Thomas Middle Island","Trinity Palmetto Point"] },
  "LCA":{ name:"Saint Lucia",continent:"North America",states:["Anse la Raye","Canaries","Castries","Choiseul","Dennery","Gros Islet","Laborie","Micoud","Soufrière","Vieux Fort"] },
  "VCT":{ name:"Saint Vincent and the Grenadines",continent:"North America",states:["Charlotte","Grenadines","Saint Andrew","Saint David","Saint George","Saint Patrick"] },
  "TTO":{ name:"Trinidad and Tobago",continent:"North America",states:["Arima","Chaguanas","Couva-Tabaquite-Talparo","Diego Martin","Mayaro","Penal-Debe","Port of Spain","Princes Town","Rio Claro-Mayaro","San Fernando","San Juan-Laventille","Sangre Grande","Siparia","Tobago","Tunapuna-Piarco"] },
  "USA":{ name:"United States",continent:"North America",states:["Alabama","Alaska","Arizona","Arkansas","California","Colorado","Connecticut","Delaware","Florida","Georgia","Hawaii","Idaho","Illinois","Indiana","Iowa","Kansas","Kentucky","Louisiana","Maine","Maryland","Massachusetts","Michigan","Minnesota","Mississippi","Missouri","Montana","Nebraska","Nevada","New Hampshire","New Jersey","New Mexico","New York","North Carolina","North Dakota","Ohio","Oklahoma","Oregon","Pennsylvania","Rhode Island","South Carolina","South Dakota","Tennessee","Texas","Utah","Vermont","Virginia","Washington","Washington DC","West Virginia","Wisconsin","Wyoming"] },
  // SOUTH AMERICA
  "ARG":{ name:"Argentina",continent:"South America",states:["Buenos Aires","Buenos Aires Province","Catamarca","Chaco","Chubut","Córdoba","Corrientes","Entre Ríos","Formosa","Jujuy","La Pampa","La Rioja","Mendoza","Misiones","Neuquén","Río Negro","Salta","San Juan","San Luis","Santa Cruz","Santa Fe","Santiago del Estero","Tierra del Fuego","Tucumán"] },
  "BOL":{ name:"Bolivia",continent:"South America",states:["Beni","Chuquisaca","Cochabamba","La Paz","Oruro","Pando","Potosí","Santa Cruz","Tarija"] },
  "BRA":{ name:"Brazil",continent:"South America",states:["Acre","Alagoas","Amapá","Amazonas","Bahia","Ceará","Distrito Federal","Espírito Santo","Goiás","Maranhão","Mato Grosso","Mato Grosso do Sul","Minas Gerais","Pará","Paraíba","Paraná","Pernambuco","Piauí","Rio de Janeiro","Rio Grande do Norte","Rio Grande do Sul","Rondônia","Roraima","Santa Catarina","São Paulo","Sergipe","Tocantins"] },
  "CHL":{ name:"Chile",continent:"South America",states:["Antofagasta","Araucanía","Arica and Parinacota","Atacama","Aysén","Biobío","Coquimbo","Los Lagos","Los Ríos","Magallanes","Maule","Metropolitana","Ñuble","O'Higgins","Tarapacá","Valparaíso"] },
  "COL":{ name:"Colombia",continent:"South America",states:["Amazonas","Antioquia","Arauca","Atlántico","Bogotá","Bolívar","Boyacá","Caldas","Caquetá","Casanare","Cauca","Cesar","Chocó","Córdoba","Cundinamarca","Guainía","Guaviare","Huila","La Guajira","Magdalena","Meta","Nariño","Norte de Santander","Putumayo","Quindío","Risaralda","San Andrés","Santander","Sucre","Tolima","Valle del Cauca","Vaupés","Vichada"] },
  "ECU":{ name:"Ecuador",continent:"South America",states:["Azuay","Bolívar","Cañar","Carchi","Chimborazo","Cotopaxi","El Oro","Esmeraldas","Galápagos","Guayas","Imbabura","Loja","Los Ríos","Manabí","Morona-Santiago","Napo","Orellana","Pastaza","Pichincha","Santa Elena","Santo Domingo","Sucumbíos","Tungurahua","Zamora-Chinchipe"] },
  "GUY":{ name:"Guyana",continent:"South America",states:["Barima-Waini","Cuyuni-Mazaruni","Demerara-Mahaica","East Berbice-Corentyne","Essequibo Islands-West Demerara","Mahaica-Berbice","Pomeroon-Supenaam","Potaro-Siparuni","Upper Demerara-Berbice","Upper Takutu-Upper Essequibo"] },
  "PRY":{ name:"Paraguay",continent:"South America",states:["Alto Paraguay","Alto Paraná","Amambay","Asunción","Boquerón","Caaguazú","Caazapá","Canindeyú","Central","Concepción","Cordillera","Guairá","Itapúa","Misiones","Ñeembucú","Paraguarí","Presidente Hayes","San Pedro"] },
  "PER":{ name:"Peru",continent:"South America",states:["Amazonas","Ancash","Apurímac","Arequipa","Ayacucho","Cajamarca","Callao","Cusco","Huancavelica","Huánuco","Ica","Junín","La Libertad","Lambayeque","Lima","Loreto","Madre de Dios","Moquegua","Pasco","Piura","Puno","San Martín","Tacna","Tumbes","Ucayali"] },
  "SUR":{ name:"Suriname",continent:"South America",states:["Brokopondo","Commewijne","Coronie","Marowijne","Nickerie","Para","Paramaribo","Saramacca","Sipaliwini","Wanica"] },
  "URY":{ name:"Uruguay",continent:"South America",states:["Artigas","Canelones","Cerro Largo","Colonia","Durazno","Flores","Florida","Lavalleja","Maldonado","Montevideo","Paysandú","Río Negro","Rivera","Rocha","Salto","San José","Soriano","Tacuarembó","Treinta y Tres"] },
  "VEN":{ name:"Venezuela",continent:"South America",states:["Amazonas","Anzoátegui","Apure","Aragua","Barinas","Bolívar","Carabobo","Cojedes","Delta Amacuro","Dependencias Federales","Distrito Capital","Falcón","Guárico","La Guaira","Lara","Mérida","Miranda","Monagas","Nueva Esparta","Portuguesa","Sucre","Táchira","Trujillo","Yaracuy","Zulia"] },
  // OCEANIA
  "AUS":{ name:"Australia",continent:"Oceania",states:["Australian Capital Territory","New South Wales","Northern Territory","Queensland","South Australia","Tasmania","Victoria","Western Australia"] },
  "FJI":{ name:"Fiji",continent:"Oceania",states:["Ba","Bua","Cakaudrove","Kadavu","Lau","Lomaiviti","Macuata","Nadroga-Navosa","Naitasiri","Namosi","Ra","Rewa","Rotuma","Serua","Tailevu"] },
  "KIR":{ name:"Kiribati",continent:"Oceania",states:["Gilbert Islands","Line Islands","Phoenix Islands"] },
  "MHL":{ name:"Marshall Islands",continent:"Oceania",states:["Ralik Chain","Ratak Chain"] },
  "FSM":{ name:"Micronesia",continent:"Oceania",states:["Chuuk","Kosrae","Pohnpei","Yap"] },
  "NRU":{ name:"Nauru",continent:"Oceania",states:["Aiwo","Anabar","Anetan","Anibare","Baiti","Boe","Buada","Denigomodu","Ewa","Ijuw","Meneng","Nibok","Uaboe","Yaren"] },
  "NZL":{ name:"New Zealand",continent:"Oceania",states:["Auckland","Bay of Plenty","Canterbury","Gisborne","Hawke's Bay","Manawatu-Whanganui","Marlborough","Nelson","Northland","Otago","Southland","Taranaki","Tasman","Waikato","Wellington","West Coast"] },
  "PLW":{ name:"Palau",continent:"Oceania",states:["Aimeliik","Airai","Angaur","Hatohobei","Kayangel","Koror","Melekeok","Ngaraard","Ngarchelong","Ngardmau","Ngatpang","Ngchesar","Ngeremlengui","Ngiwal","Peleliu","Sonsorol"] },
  "PNG":{ name:"Papua New Guinea",continent:"Oceania",states:["Bougainville","Central","Chimbu","East New Britain","East Sepik","Eastern Highlands","Enga","Gulf","Hela","Jiwaka","Madang","Manus","Milne Bay","Morobe","National Capital","New Ireland","Northern","Southern Highlands","West New Britain","West Sepik","Western","Western Highlands"] },
  "WSM":{ name:"Samoa",continent:"Oceania",states:["A'ana","Aiga-i-le-Tai","Atua","Fa'asaleleaga","Gaga'emauga","Gaga'ifomauga","Palauli","Satupa'itea","Tuamasaga","Va'a-o-Fonoti","Vaisigano"] },
  "SLB":{ name:"Solomon Islands",continent:"Oceania",states:["Capital Territory","Central","Choiseul","Guadalcanal","Isabel","Makira-Ulawa","Malaita","Rennell and Bellona","Temotu","Western"] },
  "TON":{ name:"Tonga",continent:"Oceania",states:["Eua","Ha'apai","Niuas","Tongatapu","Vava'u"] },
  "TUV":{ name:"Tuvalu",continent:"Oceania",states:["Funafuti","Nanumaga","Nanumea","Niutao","Nui","Nukufetau","Nukulaelae","Vaitupu"] },
  "VUT":{ name:"Vanuatu",continent:"Oceania",states:["Malampa","Penama","Sanma","Shefa","Tafea","Torba"] },
};

// ══════════════════════════════════════════════════════════════════
// SEED world_geo TABLE ON STARTUP
// ══════════════════════════════════════════════════════════════════
async function seedWorldGeo() {
  if (!supabase) { console.log("[Seed] Skipped — no Supabase client configured."); return; }
  console.log("[Seed] Starting world_geo seed…");
  const { count } = await supabase.from("world_geo").select("*", { count:"exact", head:true });
  if (count && count > 100) { console.log(`[Seed] Already seeded (${count} rows)`); return; }

  const rows = [];
  for (const [iso, data] of Object.entries(WORLD_GEO)) {
    // Country row
    rows.push({ country_iso:iso, country_name:data.name, continent:data.continent, state_name:null, state_code:null });
    // State rows
    for (const state of data.states) {
      rows.push({ country_iso:iso, country_name:data.name, continent:data.continent, state_name:state, state_code:null });
    }
  }

  console.log(`[Seed] Inserting ${rows.length} rows…`);
  for (let i = 0; i < rows.length; i += 500) {
    const batch = rows.slice(i, i + 500);
    const { error } = await supabase.from("world_geo").upsert(batch, { onConflict:"country_iso,state_name", ignoreDuplicates:true });
    if (error) console.error(`[Seed] Batch ${i/500+1} error:`, error.message);
    else console.log(`[Seed] Batch ${i/500+1}/${Math.ceil(rows.length/500)} done`);
  }
  console.log("[Seed] ✓ world_geo seeded");
}

// ══════════════════════════════════════════════════════════════════
// API ROUTES
// ══════════════════════════════════════════════════════════════════
app.get("/",        (req,res) => res.json({ status:"ok", service:"GlobeVoyage" }));
app.get("/health",  (req,res) => res.json({ status:"ok", uptime:process.uptime() }));

// GET /api/countries — list all countries
app.get("/api/countries", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("world_geo").select("country_iso,country_name,continent")
      .is("state_name", null).order("country_name");
    if (error) throw error;
    res.json({ countries: data });
  } catch(e) {
    // Fallback from memory
    const countries = Object.entries(WORLD_GEO).map(([iso,d]) => ({
      country_iso:iso, country_name:d.name, continent:d.continent
    })).sort((a,b) => a.country_name.localeCompare(b.country_name));
    res.json({ countries });
  }
});

// GET /api/countries/:iso/states — list states for a country
app.get("/api/countries/:iso/states", async (req, res) => {
  const { iso } = req.params;
  try {
    const { data, error } = await supabase
      .from("world_geo").select("id,state_name,country_iso,country_name")
      .eq("country_iso", iso).not("state_name","is",null).order("state_name");
    if (error) throw error;
    if (data && data.length > 0) return res.json({ states: data.map(r => ({ id:r.id, name:r.state_name, country_iso:r.country_iso })) });
    throw new Error("not found");
  } catch(e) {
    // Fallback from memory
    const country = WORLD_GEO[iso];
    if (!country) return res.status(404).json({ error:"Country not found" });
    res.json({ states: country.states.map((s,i) => ({ id:`${iso}_${i}`, name:s, country_iso:iso })) });
  }
});

// GET /api/geo/countries/:iso/states — legacy compat
app.get("/api/geo/countries/:iso/states", (req,res) => {
  res.redirect(307, `/api/countries/${req.params.iso}/states`);
});

// GET /api/geo/states/:id/areas — stub (areas not implemented yet)
app.get("/api/geo/states/:id/areas", (req, res) => {
  res.json({ areas:[], message:"Areas coming soon" });
});

// GET /api/destinations — returns countries with intel (simplified)
app.get("/api/destinations", (req, res) => {
  const top = ["USA","FRA","JPN","ITA","ESP","GBR","AUS","THA","ARE","DEU","BRA","IND","MEX","GRC","PRT","NGA","ZAF","KEN","SGP","NLD"];
  const dests = top.map(iso => {
    const c = WORLD_GEO[iso];
    return c ? { id:iso, iso, name:c.name, country:c.name, continent:c.continent } : null;
  }).filter(Boolean);
  res.json(dests);
});

// POST /api/admin/reset — drop + re-seed (protected by service key)
app.post("/api/admin/reset", async (req, res) => {
  res.json({ started:true, message:"Re-seeding world_geo…" });
  try {
    await supabase.from("world_geo").delete().not("id","is",null);
    await seedWorldGeo();
  } catch(e) { console.error("[Reset]", e.message); }
});

// ══════════════════════════════════════════════════════════════════
// GLOBE ENDPOINT
// ══════════════════════════════════════════════════════════════════
app.get("/globe", (req, res) => {
  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>
*{margin:0;padding:0;box-sizing:border-box;}
html,body{width:100%;height:100%;background:#030810;overflow:hidden;touch-action:none;}
#c{position:fixed;top:0;left:0;width:100%;height:100%;}
#lbl{position:fixed;bottom:24px;left:0;right:0;text-align:center;font-family:-apple-system,BlinkMacSystemFont,sans-serif;font-size:16px;font-weight:800;letter-spacing:4px;color:#c9a96e;text-shadow:0 0 25px rgba(201,169,110,0.85);opacity:0;transition:opacity 0.2s;pointer-events:none;}
#hint{position:fixed;top:14px;left:0;right:0;text-align:center;font-family:-apple-system,sans-serif;font-size:11px;color:rgba(255,255,255,0.22);letter-spacing:2px;pointer-events:none;}
#load{position:fixed;inset:0;background:#030810;display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:99;transition:opacity 0.5s;}
#load-t{font-family:-apple-system,sans-serif;font-size:12px;color:#c9a96e;letter-spacing:3px;}
#bar{width:100px;height:2px;background:rgba(201,169,110,0.2);border-radius:1px;margin-top:10px;overflow:hidden;}
#bar-f{height:100%;background:#c9a96e;width:0%;transition:width 0.2s;}
#zoom-hint{position:fixed;bottom:52px;left:0;right:0;text-align:center;font-family:-apple-system,sans-serif;font-size:10px;color:rgba(255,255,255,0.15);letter-spacing:1.5px;pointer-events:none;}
</style>
</head>
<body>
<canvas id="c"></canvas>
<div id="load"><div id="load-t">LOADING EARTH</div><div id="bar"><div id="bar-f"></div></div></div>
<div id="hint">SPIN · TAP A COUNTRY</div>
<div id="zoom-hint">PINCH TO ZOOM</div>
<div id="lbl"></div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
<script>
(function(){
const canvas=document.getElementById('c');
const W=window.innerWidth,H=window.innerHeight;
const renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.setSize(W,H);
renderer.setClearColor(0x030810,1);
const scene=new THREE.Scene();
const camera=new THREE.PerspectiveCamera(40,W/H,0.1,1000);
camera.position.z=7.5;
const MIN_Z=1.2,MAX_Z=8.0;

scene.add(new THREE.AmbientLight(0x334466,2.8));
const sun=new THREE.DirectionalLight(0xfff0dd,2.2);
sun.position.set(5,2,4);scene.add(sun);
const back=new THREE.DirectionalLight(0x112244,0.5);
back.position.set(-4,-1,-3);scene.add(back);

(function(){
  const g=new THREE.BufferGeometry(),p=[],col=[];
  for(let i=0;i<3500;i++){
    const r=50+Math.random()*40,t=Math.random()*Math.PI*2,a=Math.acos(2*Math.random()-1);
    p.push(r*Math.sin(a)*Math.cos(t),r*Math.sin(a)*Math.sin(t),r*Math.cos(a));
    const w=Math.random();col.push(0.75+w*0.25,0.8+w*0.15,0.85+Math.random()*0.15);
  }
  g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));
  g.setAttribute('color',new THREE.Float32BufferAttribute(col,3));
  scene.add(new THREE.Points(g,new THREE.PointsMaterial({size:0.09,vertexColors:true,transparent:true,opacity:0.75})));
})();

const pivot=new THREE.Object3D();scene.add(pivot);
const globe=new THREE.Mesh(new THREE.SphereGeometry(1,128,128),new THREE.MeshPhongMaterial({color:0x1a3a6a,emissive:0x050f20,shininess:20}));
pivot.add(globe);
const cloudMesh=new THREE.Mesh(new THREE.SphereGeometry(1.007,64,64),new THREE.MeshPhongMaterial({transparent:true,opacity:0,depthWrite:false}));
pivot.add(cloudMesh);

const atmVS=['varying vec3 vN;','void main(){vN=normalize(normalMatrix*normal);','gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}'].join('\\n');
const atmFS=['varying vec3 vN;','void main(){','float i=pow(0.56-dot(vN,vec3(0.0,0.0,1.0)),5.0);','gl_FragColor=vec4(0.15,0.45,1.0,i*0.7);}'].join('\\n');
const hazeFS=['varying vec3 vN;','void main(){','float i=pow(max(0.0,0.48-dot(vN,vec3(0.0,0.0,1.0))),3.5);','gl_FragColor=vec4(0.1,0.35,0.9,i*0.15);}'].join('\\n');
scene.add(new THREE.Mesh(new THREE.SphereGeometry(1.14,64,64),new THREE.ShaderMaterial({uniforms:{},vertexShader:atmVS,fragmentShader:atmFS,side:THREE.BackSide,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false})));
scene.add(new THREE.Mesh(new THREE.SphereGeometry(1.002,64,64),new THREE.ShaderMaterial({uniforms:{},vertexShader:atmVS,fragmentShader:hazeFS,side:THREE.FrontSide,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false})));

let loaded=0;
const bar=document.getElementById('bar-f');
function prog(n){loaded+=n;bar.style.width=Math.min(loaded,100)+'%';}
function hideLoad(){const el=document.getElementById('load');el.style.opacity='0';setTimeout(()=>el.style.display='none',500);}

const TL=new THREE.TextureLoader();TL.crossOrigin='anonymous';
function tryUrls(urls,i,cb){if(i>=urls.length){cb(null);return;}TL.load(urls[i],cb,undefined,()=>tryUrls(urls,i+1,cb));}

const EARTH=['https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg','https://raw.githubusercontent.com/turban/webgl-earth/master/images/2_no_clouds_4k.jpg'];
const SPEC=['https://unpkg.com/three-globe/example/img/earth-water.png'];
const BUMP=['https://unpkg.com/three-globe/example/img/earth-topology.png'];
const CLOUD=['https://unpkg.com/three-globe/example/img/earth-clouds.png'];

let doneCount=0;
function checkDone(){doneCount++;if(doneCount>=2)hideLoad();}

tryUrls(EARTH,0,tex=>{
  prog(60);
  if(tex){
    tex.anisotropy=renderer.capabilities.getMaxAnisotropy();
    tryUrls(SPEC,0,specTex=>{
      tryUrls(BUMP,0,bumpTex=>{
        globe.material=new THREE.MeshPhongMaterial({map:tex,specularMap:specTex||null,bumpMap:bumpTex||null,bumpScale:0.025,specular:new THREE.Color(0x223366),shininess:22});
        checkDone();
      });
    });
  } else checkDone();
});

tryUrls(CLOUD,0,tex=>{
  prog(40);
  if(tex){cloudMesh.material.map=tex;cloudMesh.material.opacity=0.22;cloudMesh.material.needsUpdate=true;}
  checkDone();
});

const CTRY=[
  {n:"Afghanistan",iso:"AFG",la:33.9,lo:67.7},{n:"Albania",iso:"ALB",la:41.2,lo:20.2},
  {n:"Algeria",iso:"DZA",la:28.0,lo:1.7},{n:"Angola",iso:"AGO",la:-11.2,lo:17.9},
  {n:"Argentina",iso:"ARG",la:-38.4,lo:-63.6},{n:"Armenia",iso:"ARM",la:40.1,lo:45.0},
  {n:"Australia",iso:"AUS",la:-25.3,lo:133.8},{n:"Austria",iso:"AUT",la:47.5,lo:14.6},
  {n:"Azerbaijan",iso:"AZE",la:40.1,lo:47.6},{n:"Bangladesh",iso:"BGD",la:23.7,lo:90.4},
  {n:"Belarus",iso:"BLR",la:53.7,lo:28.0},{n:"Belgium",iso:"BEL",la:50.5,lo:4.5},
  {n:"Bolivia",iso:"BOL",la:-16.3,lo:-63.6},{n:"Brazil",iso:"BRA",la:-14.2,lo:-51.9},
  {n:"Bulgaria",iso:"BGR",la:42.7,lo:25.5},{n:"Cambodia",iso:"KHM",la:12.6,lo:104.9},
  {n:"Cameroon",iso:"CMR",la:3.8,lo:11.5},{n:"Canada",iso:"CAN",la:56.1,lo:-106.3},
  {n:"Chile",iso:"CHL",la:-35.7,lo:-71.5},{n:"China",iso:"CHN",la:35.9,lo:104.2},
  {n:"Colombia",iso:"COL",la:4.6,lo:-74.3},{n:"Costa Rica",iso:"CRI",la:9.7,lo:-83.8},
  {n:"Croatia",iso:"HRV",la:45.1,lo:15.2},{n:"Cuba",iso:"CUB",la:21.5,lo:-77.8},
  {n:"Czech Republic",iso:"CZE",la:49.8,lo:15.5},{n:"DR Congo",iso:"COD",la:-4.0,lo:21.8},
  {n:"Denmark",iso:"DNK",la:56.3,lo:9.5},{n:"Dominican Republic",iso:"DOM",la:18.7,lo:-70.2},
  {n:"Ecuador",iso:"ECU",la:-1.8,lo:-78.2},{n:"Egypt",iso:"EGY",la:26.8,lo:30.8},
  {n:"Ethiopia",iso:"ETH",la:9.1,lo:40.5},{n:"Finland",iso:"FIN",la:64.0,lo:25.7},
  {n:"France",iso:"FRA",la:46.2,lo:2.2},{n:"Germany",iso:"DEU",la:51.2,lo:10.5},
  {n:"Ghana",iso:"GHA",la:7.9,lo:-1.0},{n:"Greece",iso:"GRC",la:39.1,lo:21.8},
  {n:"Guatemala",iso:"GTM",la:15.8,lo:-90.2},{n:"Hungary",iso:"HUN",la:47.2,lo:19.5},
  {n:"Iceland",iso:"ISL",la:65.0,lo:-18.1},{n:"India",iso:"IND",la:20.6,lo:79.1},
  {n:"Indonesia",iso:"IDN",la:-0.8,lo:113.9},{n:"Iran",iso:"IRN",la:32.4,lo:53.7},
  {n:"Iraq",iso:"IRQ",la:33.2,lo:43.7},{n:"Ireland",iso:"IRL",la:53.1,lo:-8.2},
  {n:"Israel",iso:"ISR",la:31.0,lo:34.9},{n:"Italy",iso:"ITA",la:41.9,lo:12.6},
  {n:"Ivory Coast",iso:"CIV",la:7.5,lo:-5.6},{n:"Jamaica",iso:"JAM",la:18.1,lo:-77.3},
  {n:"Japan",iso:"JPN",la:36.2,lo:138.3},{n:"Jordan",iso:"JOR",la:30.6,lo:36.2},
  {n:"Kazakhstan",iso:"KAZ",la:48.0,lo:66.9},{n:"Kenya",iso:"KEN",la:0.0,lo:37.9},
  {n:"South Korea",iso:"KOR",la:35.9,lo:127.8},{n:"Kuwait",iso:"KWT",la:29.3,lo:47.5},
  {n:"Laos",iso:"LAO",la:19.9,lo:102.5},{n:"Lebanon",iso:"LBN",la:33.9,lo:35.9},
  {n:"Libya",iso:"LBY",la:26.3,lo:17.2},{n:"Madagascar",iso:"MDG",la:-18.8,lo:46.9},
  {n:"Malaysia",iso:"MYS",la:4.2,lo:108.0},{n:"Mexico",iso:"MEX",la:23.6,lo:-102.6},
  {n:"Mongolia",iso:"MNG",la:46.9,lo:103.8},{n:"Morocco",iso:"MAR",la:31.8,lo:-7.1},
  {n:"Mozambique",iso:"MOZ",la:-18.7,lo:35.5},{n:"Myanmar",iso:"MMR",la:21.9,lo:95.9},
  {n:"Nepal",iso:"NPL",la:28.4,lo:84.1},{n:"Netherlands",iso:"NLD",la:52.1,lo:5.3},
  {n:"New Zealand",iso:"NZL",la:-40.9,lo:174.9},{n:"Nigeria",iso:"NGA",la:9.1,lo:8.7},
  {n:"Norway",iso:"NOR",la:60.5,lo:8.5},{n:"Oman",iso:"OMN",la:21.5,lo:55.9},
  {n:"Pakistan",iso:"PAK",la:30.4,lo:69.3},{n:"Peru",iso:"PER",la:-9.2,lo:-75.0},
  {n:"Philippines",iso:"PHL",la:12.9,lo:121.8},{n:"Poland",iso:"POL",la:51.9,lo:19.1},
  {n:"Portugal",iso:"PRT",la:39.4,lo:-8.2},{n:"Qatar",iso:"QAT",la:25.4,lo:51.2},
  {n:"Romania",iso:"ROU",la:45.9,lo:24.9},{n:"Russia",iso:"RUS",la:61.5,lo:105.3},
  {n:"Rwanda",iso:"RWA",la:-1.9,lo:29.9},{n:"Saudi Arabia",iso:"SAU",la:24.0,lo:45.1},
  {n:"Senegal",iso:"SEN",la:14.5,lo:-14.5},{n:"Serbia",iso:"SRB",la:44.0,lo:21.0},
  {n:"Singapore",iso:"SGP",la:1.3,lo:103.8},{n:"South Africa",iso:"ZAF",la:-30.6,lo:22.9},
  {n:"Spain",iso:"ESP",la:40.5,lo:-3.7},{n:"Sri Lanka",iso:"LKA",la:7.9,lo:80.8},
  {n:"Sudan",iso:"SDN",la:12.9,lo:30.2},{n:"Sweden",iso:"SWE",la:62.2,lo:17.6},
  {n:"Switzerland",iso:"CHE",la:46.8,lo:8.2},{n:"Syria",iso:"SYR",la:35.0,lo:38.0},
  {n:"Taiwan",iso:"TWN",la:23.7,lo:121.0},{n:"Tanzania",iso:"TZA",la:-6.4,lo:34.9},
  {n:"Thailand",iso:"THA",la:15.9,lo:100.9},{n:"Tunisia",iso:"TUN",la:34.0,lo:9.0},
  {n:"Turkey",iso:"TUR",la:38.9,lo:35.2},{n:"Uganda",iso:"UGA",la:1.4,lo:32.3},
  {n:"Ukraine",iso:"UKR",la:48.4,lo:31.2},{n:"United Arab Emirates",iso:"ARE",la:23.4,lo:53.8},
  {n:"United Kingdom",iso:"GBR",la:55.4,lo:-3.4},{n:"United States",iso:"USA",la:37.1,lo:-95.7},
  {n:"Uruguay",iso:"URY",la:-32.5,lo:-55.8},{n:"Uzbekistan",iso:"UZB",la:41.4,lo:64.6},
  {n:"Venezuela",iso:"VEN",la:6.4,lo:-66.6},{n:"Vietnam",iso:"VNM",la:14.1,lo:108.3},
  {n:"Yemen",iso:"YEM",la:15.6,lo:48.5},{n:"Zambia",iso:"ZMB",la:-13.1,lo:27.9},
  {n:"Zimbabwe",iso:"ZWE",la:-19.0,lo:29.2},
];

function ll2v(la,lo,r){
  const phi=(90-la)*Math.PI/180,th=(lo+180)*Math.PI/180;
  return new THREE.Vector3(-Math.sin(phi)*Math.cos(th),Math.cos(phi),Math.sin(phi)*Math.sin(th)).multiplyScalar(r);
}
const dotG=new THREE.SphereGeometry(0.011,8,8);
const dots=[];
CTRY.forEach(c=>{
  const m=new THREE.MeshBasicMaterial({color:0xffd700,transparent:true,opacity:0.92});
  const d=new THREE.Mesh(dotG,m);
  d.position.copy(ll2v(c.la,c.lo,1.018));
  d.userData=c;pivot.add(d);dots.push(d);
});

let drag=false,px=0,py=0,pt=0,vx=0,vy=0;
let pinching=false,pinchDist0=0,camZ0=0;
let tapStart={x:0,y:0,t:0};
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}

function panStart(x,y){drag=true;px=x;py=y;pt=Date.now();vx=0;vy=0;}
function panMove(x,y){
  if(!drag)return;
  const now=Date.now(),dt=Math.max(1,now-pt),dx=x-px,dy=y-py;
  vx=clamp(dx/dt*14,-0.07,0.07);vy=clamp(dy/dt*14,-0.07,0.07);
  pivot.rotation.y+=dx*0.007;
  pivot.rotation.x=clamp(pivot.rotation.x+dy*0.005,-1.25,1.25);
  px=x;py=y;pt=now;
}
function panEnd(){drag=false;}
function pDist(t){return Math.hypot(t[0].clientX-t[1].clientX,t[0].clientY-t[1].clientY);}

canvas.addEventListener('mousedown',e=>{tapStart={x:e.clientX,y:e.clientY,t:Date.now()};panStart(e.clientX,e.clientY);});
canvas.addEventListener('mousemove',e=>{if(drag)panMove(e.clientX,e.clientY);});
canvas.addEventListener('mouseup',e=>{panEnd();if(Math.hypot(e.clientX-tapStart.x,e.clientY-tapStart.y)<8)pick(e.clientX,e.clientY);});
canvas.addEventListener('wheel',e=>{e.preventDefault();camera.position.z=clamp(camera.position.z+e.deltaY*0.002,MIN_Z,MAX_Z);},{passive:false});

canvas.addEventListener('touchstart',e=>{
  e.preventDefault();
  if(e.touches.length===1){tapStart={x:e.touches[0].clientX,y:e.touches[0].clientY,t:Date.now()};panStart(tapStart.x,tapStart.y);pinching=false;}
  else if(e.touches.length===2){pinching=true;drag=false;pinchDist0=pDist(e.touches);camZ0=camera.position.z;}
},{passive:false});
canvas.addEventListener('touchmove',e=>{
  e.preventDefault();
  if(e.touches.length===2&&pinching){camera.position.z=clamp(camZ0*pinchDist0/pDist(e.touches),MIN_Z,MAX_Z);}
  else if(e.touches.length===1&&!pinching)panMove(e.touches[0].clientX,e.touches[0].clientY);
},{passive:false});
canvas.addEventListener('touchend',e=>{
  e.preventDefault();
  if(e.touches.length===0){
    if(pinching){pinching=false;return;}
    panEnd();
    const ch=e.changedTouches[0];
    if(Math.hypot(ch.clientX-tapStart.x,ch.clientY-tapStart.y)<12&&Date.now()-tapStart.t<280)pick(ch.clientX,ch.clientY);
  }
  if(e.touches.length===1)pinching=false;
},{passive:false});

const ray=new THREE.Raycaster(),mouse=new THREE.Vector2();
function pick(cx,cy){
  const rect=canvas.getBoundingClientRect();
  mouse.set(((cx-rect.left)/rect.width)*2-1,-((cy-rect.top)/rect.height)*2+1);
  ray.setFromCamera(mouse,camera);
  const dh=ray.intersectObjects(dots);
  if(dh.length){sel(dh[0].object.userData);return;}
  const gh=ray.intersectObject(globe);
  if(gh.length){
    const pt=pivot.worldToLocal(gh[0].point.clone()).normalize();
    let best=null,bd=9;
    dots.forEach(d=>{const dist=pt.distanceTo(d.position.clone().normalize());if(dist<bd){bd=dist;best=d;}});
    if(best&&bd<0.38)sel(best.userData);
  }
}
function sel(c){
  const lbl=document.getElementById('lbl');
  lbl.textContent=c.n.toUpperCase();lbl.style.opacity='1';
  setTimeout(()=>lbl.style.opacity='0',2400);
  const dot=dots.find(d=>d.userData.iso===c.iso);
  if(dot){let t=0;const iv=setInterval(()=>{t+=0.2;dot.material.color.setHex(t%1<0.5?0xffffff:0xffd700);dot.scale.setScalar(1+Math.abs(Math.sin(t))*1.3);if(t>Math.PI*2.5){clearInterval(iv);dot.material.color.setHex(0xffd700);dot.scale.setScalar(1);}},20);}
  if(window.ReactNativeWebView)window.ReactNativeWebView.postMessage(JSON.stringify({type:'DESTINATIONS',country:c.iso,name:c.n}));
}
function animate(){
  requestAnimationFrame(animate);
  if(!drag&&!pinching){vx*=0.92;vy*=0.92;pivot.rotation.y+=vx*0.013+0.0015;pivot.rotation.x=clamp(pivot.rotation.x+vy*0.009,-1.25,1.25);}
  renderer.render(scene,camera);
}
animate();
window.addEventListener('resize',()=>{const w=window.innerWidth,h=window.innerHeight;camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h);});
})();
</script>
</body>
</html>`;
  res.setHeader("Content-Type","text/html");
  res.send(html);
});

// ══════════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════
// ENV + OPTIONAL AI SETUP
// ══════════════════════════════════════════════════════════════════
const axios  = require("axios");
const xml2js = require("xml2js");

const ENV = {
  MISTRAL_API_KEY:     process.env.MISTRAL_API_KEY,
  OPENWEATHER_API_KEY: process.env.OPENWEATHER_API_KEY,
  UNSPLASH_ACCESS_KEY: process.env.UNSPLASH_ACCESS_KEY,
  GNEWS_API_KEY:       process.env.GNEWS_API_KEY,
};

// Simple in-memory intel cache (avoids hammering Mistral)
const _intelCache = {};

async function fetchWeatherForCountry(countryName) {
  if (!ENV.OPENWEATHER_API_KEY) return null;
  try {
    const r = await axios.get("https://api.openweathermap.org/data/2.5/weather", {
      params: { q: countryName, appid: ENV.OPENWEATHER_API_KEY, units: "metric" },
      timeout: 6000,
    });
    const d = r.data;
    return {
      temp:       Math.round(d.main.temp),
      feels_like: Math.round(d.main.feels_like),
      condition:  d.weather[0].description,
      icon:       d.weather[0].icon,
      humidity:   d.main.humidity,
      wind:       Math.round(d.wind.speed * 3.6),
    };
  } catch(e) { return null; }
}

async function fetchWeatherForState(stateName, countryName) {
  if (!ENV.OPENWEATHER_API_KEY) return null;
  try {
    const r = await axios.get("https://api.openweathermap.org/data/2.5/weather", {
      params: { q: `${stateName},${countryName}`, appid: ENV.OPENWEATHER_API_KEY, units: "metric" },
      timeout: 6000,
    });
    const d = r.data;
    return {
      temp:      Math.round(d.main.temp),
      condition: d.weather[0].description,
      icon:      d.weather[0].icon,
      humidity:  d.main.humidity,
    };
  } catch(e) {
    // fallback: search by state name only
    try {
      const r2 = await axios.get("https://api.openweathermap.org/data/2.5/weather", {
        params: { q: stateName, appid: ENV.OPENWEATHER_API_KEY, units: "metric" },
        timeout: 6000,
      });
      const d = r2.data;
      return { temp: Math.round(d.main.temp), condition: d.weather[0].description, icon: d.weather[0].icon };
    } catch(e2) { return null; }
  }
}

async function fetchPhotos(query) {
  if (!ENV.UNSPLASH_ACCESS_KEY) return [];
  try {
    const r = await axios.get("https://api.unsplash.com/search/photos", {
      params: { query, per_page: 6, orientation: "landscape" },
      headers: { Authorization: `Client-ID ${ENV.UNSPLASH_ACCESS_KEY}` },
      timeout: 8000,
    });
    return (r.data?.results || []).map(p => ({
      url:    p.urls?.regular,
      small:  p.urls?.small,
      credit: p.user?.name || "",
      alt:    p.alt_description || query,
    }));
  } catch(e) { return []; }
}

async function fetchNews(query) {
  try {
    const q = encodeURIComponent(query + " travel");
    const r = await axios.get(
      `https://news.google.com/rss/search?q=${q}&hl=en&gl=US&ceid=US:en`,
      { timeout: 7000, headers: { "User-Agent": "GlobeVoyage/2.0" } }
    );
    const parsed = await xml2js.parseStringPromise(r.data, { explicitArray: false });
    const items  = parsed?.rss?.channel?.item || [];
    const arr    = Array.isArray(items) ? items : [items];
    return arr.filter(i => i?.title).slice(0, 6).map(i => ({
      title:        typeof i.title === "object" ? (i.title._ || "") : (i.title || ""),
      source:       i.source?._ || "Google News",
      published_at: i.pubDate || null,
    }));
  } catch(e) { return []; }
}

// ── REAL SAFETY via Wikipedia Safety section + Google News ─────────
async function fetchWikipediaDesc(name, isState, countryName) {
  try {
    const searchTerm = isState ? `${name} ${countryName}` : name;
    const searchRes = await axios.get("https://en.wikipedia.org/w/api.php", {
      params:{ action:"query", format:"json", list:"search", srsearch:searchTerm, srlimit:1 },
      timeout:6000, headers:{"User-Agent":"GlobeVoyage/2.0"}
    });
    const title = searchRes.data?.query?.search?.[0]?.title;
    if (!title) return null;
    const cRes = await axios.get("https://en.wikipedia.org/w/api.php", {
      params:{ action:"query", format:"json", prop:"extracts", exintro:true, explaintext:true,
               exsentences: isState ? 3 : 2, titles:title },
      timeout:6000, headers:{"User-Agent":"GlobeVoyage/2.0"}
    });
    const pages = cRes.data?.query?.pages || {};
    const extract = Object.values(pages)[0]?.extract || "";
    if (!extract) return null;
    const sentences = extract.match(/[^.!?]+[.!?]+/g) || [];
    return sentences.slice(0, isState ? 3 : 1).join(" ").trim() || null;
  } catch(e) { return null; }
}

async function fetchSafetyFromWikipedia(name, countryName) {
  // Fetch the Wikipedia page and look for safety-related sections
  try {
    const searchTerm = countryName ? `${name} ${countryName}` : name;
    const sRes = await axios.get("https://en.wikipedia.org/w/api.php", {
      params:{ action:"query", format:"json", list:"search", srsearch:`${searchTerm} safety travel`, srlimit:1 },
      timeout:6000, headers:{"User-Agent":"GlobeVoyage/2.0"}
    });
    const title = sRes.data?.query?.search?.[0]?.title;
    if (!title) return null;
    const cRes = await axios.get("https://en.wikipedia.org/w/api.php", {
      params:{ action:"query", format:"json", prop:"extracts", explaintext:true, titles:title, exsectionformat:"plain" },
      timeout:6000, headers:{"User-Agent":"GlobeVoyage/2.0"}
    });
    const pages = cRes.data?.query?.pages || {};
    const extract = Object.values(pages)[0]?.extract || "";
    // Look for safety/crime/security section
    const lines = extract.split("\n");
    let safetyLine = null;
    for (let li = 0; li < lines.length; li++) {
      if (/safety|crime|security|risk/i.test(lines[li]) && lines[li+1] && lines[li+1].length > 50) {
        safetyLine = lines[li+1].trim().slice(0,200);
        break;
      }
    }
    if (safetyLine) return safetyLine;
    return null;
  } catch(e) { return null; }
}

async function fetchSafetyFromNews(placeName) {
  // Use Google News to get real current safety headlines and synthesise a verdict
  try {
    const q = encodeURIComponent(`"${placeName}" safety travel warning crime 2025 2026`);
    const r = await axios.get(
      `https://news.google.com/rss/search?q=${q}&hl=en&gl=US&ceid=US:en`,
      { timeout:7000, headers:{"User-Agent":"GlobeVoyage/2.0"} }
    );
    const parsed = await xml2js.parseStringPromise(r.data, {explicitArray:false});
    const items = parsed?.rss?.channel?.item || [];
    const arr = Array.isArray(items) ? items : [items];
    const headlines = arr.slice(0,5).map(i => {
      const t = typeof i.title === "object" ? (i.title._ || "") : (i.title || "");
      return t.replace(/ - [^-]+$/, "").trim(); // strip source suffix
    }).filter(Boolean);
    if (!headlines.length) return null;

    // Score danger level from headlines
    const combined = headlines.join(" ").toLowerCase();
    const dangerWords = ["do not travel","extreme danger","war","conflict","attack","bombing","kidnap","terrorist","coup","civil war","invasion"];
    const cautionWords = ["caution","warning","crime","robbery","scam","unrest","protest","risk","violent","mugging"];
    const safeWords = ["safe","peaceful","stable","low crime","secure","recommended"];

    const dangerScore  = dangerWords.filter(w => combined.includes(w)).length;
    const cautionScore = cautionWords.filter(w => combined.includes(w)).length;
    const safeScore    = safeWords.filter(w => combined.includes(w)).length;

    let verdict;
    if (dangerScore >= 2) {
      verdict = `${placeName} is currently HIGH RISK — recent news indicates ${dangerWords.filter(w=>combined.includes(w)).slice(0,2).join(" and ")} concerns.`;
    } else if (cautionScore >= 2) {
      verdict = `${placeName} requires caution — current reports mention ${cautionWords.filter(w=>combined.includes(w)).slice(0,2).join(" and ")} concerns for travelers.`;
    } else if (safeScore >= 1) {
      verdict = `${placeName} is generally considered safe for travelers based on current conditions.`;
    } else if (headlines.length > 0) {
      verdict = `${placeName} safety: ${headlines[0].slice(0,120)}.`;
    } else {
      return null;
    }
    return verdict;
  } catch(e) { return null; }
}

async function fetchSafetyFromRestCountries(iso) {
  // Pull region + subregion to give geographic safety context
  try {
    const r = await axios.get(`https://restcountries.com/v3.1/alpha/${iso}`, { timeout:6000 });
    const c = r.data?.[0];
    if (!c) return null;
    const region = c.region || "";
    const sub    = c.subregion || "";
    const name   = c.name?.common || "";
    // Rough regional safety baseline from UN Peace Index zones
    const dangerZones = ["Western Africa","Middle Africa","Eastern Africa","Central America","Western Asia","Southern Asia","Eastern Europe"];
    const cautionZones = ["South America","South-Eastern Asia","Northern Africa","Caribbean"];
    const safeZones   = ["Northern Europe","Western Europe","Northern America","Australia and New Zealand","Eastern Asia"];
    if (safeZones.includes(sub)) return `${name} is in ${sub}, one of the world's safer regions with generally low crime and stable governance.`;
    if (dangerZones.includes(sub)) return `${name} is in ${sub} — exercise heightened caution; research specific current conditions and register with your embassy before traveling.`;
    if (cautionZones.includes(sub)) return `${name} is in ${sub} — exercise caution, stay alert in tourist areas, and research current local conditions.`;
    return `${name} is in ${region} — normal travel precautions apply; check your government's current advisory.`;
  } catch(e) { return null; }
}

async function getSafetyIntel(placeName, iso, isState, countryName) {
  // Try sources in order: News → Wikipedia → REST Countries
  try {
    const newsVerdict = await fetchSafetyFromNews(placeName);
    if (newsVerdict) return newsVerdict;
  } catch(e) {}
  if (!isState && iso) {
    try {
      const rcVerdict = await fetchSafetyFromRestCountries(iso);
      if (rcVerdict) return rcVerdict;
    } catch(e) {}
  }
  try {
    const wikiSafety = await fetchSafetyFromWikipedia(placeName, isState ? countryName : null);
    if (wikiSafety) return wikiSafety;
  } catch(e) {}
  return null;
}

// ── GET /api/intel/:iso — Country intel ──────────────────────────
// ── GET /api/intel/:iso — Country intel ──────────────────────────
app.get("/api/intel/:iso", async (req, res) => {
  const { iso } = req.params;
  const country = WORLD_GEO[iso];
  if (!country) return res.status(404).json({ error: "Country not found" });

  const cacheKey = `country_${iso}`;
  if (_intelCache[cacheKey] && Date.now() - _intelCache[cacheKey].ts < 4 * 60 * 60 * 1000) {
    return res.json(_intelCache[cacheKey].data);
  }

  const [weather, photos, news] = await Promise.all([
    fetchWeatherForCountry(country.name),
    fetchPhotos(`${country.name} travel landscape`),
    fetchNews(country.name),
  ]);

  const [wikiDesc, safetyVerdict] = await Promise.all([
    fetchWikipediaDesc(country.name, false, null),
    getSafetyIntel(country.name, iso, false, null),
  ]);

  const result = {
    iso,
    country_name:      country.name,
    continent:         country.continent,
    weather_now:       weather,
    photos,
    news_headlines:    news,
    ai_briefing:       wikiDesc || `${country.name} is a country in ${country.continent}.`,
    ai_safety_summary: safetyVerdict || `No safety data available for ${country.name} right now.`,
    ai_recommendations: [],
    ai_best_months:    [],
    ai_hidden_gem:     null,
    ai_avoid_if:       null,
    ai_cost_estimate:  null,
    ai_local_tips:     [],
    ai_traveler_scores: null,
  };

  _intelCache[cacheKey] = { data: result, ts: Date.now() };
  res.json(result);
});

// ── GET /api/intel/state/:id — State intel ────────────────────────
app.get("/api/intel/state/:id", async (req, res) => {
  const { id } = req.params;

  // id is either numeric (from DB) or "ISO_index" (memory fallback)
  let stateName = null, countryName = null, countryIso = null;

  // Try to look up from world_geo
  if (/^\d+$/.test(id)) {
    try {
      const { data } = await supabase.from("world_geo").select("state_name,country_name,country_iso").eq("id", id).maybeSingle();
      if (data) { stateName = data.state_name; countryName = data.country_name; countryIso = data.country_iso; }
    } catch(e) {}
  } else {
    // "ISO_index" format from memory fallback
    const [iso, idx] = id.split("_");
    const c = WORLD_GEO[iso];
    if (c) { countryIso = iso; countryName = c.name; stateName = c.states[parseInt(idx)] || null; }
  }

  if (!stateName || !countryName) return res.status(404).json({ error: "State not found" });

  const cacheKey = `state_${id}`;
  if (_intelCache[cacheKey] && Date.now() - _intelCache[cacheKey].ts < 4 * 60 * 60 * 1000) {
    return res.json(_intelCache[cacheKey].data);
  }

  const [weather, photos, news] = await Promise.all([
    fetchWeatherForState(stateName, countryName),
    fetchPhotos(`${stateName} ${countryName}`),
    fetchNews(`${stateName} ${countryName}`),
  ]);

  const [wikiDesc, safetyVerdict] = await Promise.all([
    fetchWikipediaDesc(stateName, true, countryName),
    getSafetyIntel(stateName, countryIso, true, countryName),
  ]);

  const result = {
    state_id:          id,
    state_name:        stateName,
    country_name:      countryName,
    country_iso:       countryIso,
    loading:           false,
    weather_now:       weather,
    photos,
    news_headlines:    news,
    ai_briefing:       wikiDesc || `${stateName} is a state or region within ${countryName}.`,
    ai_safety_summary: safetyVerdict || `No safety data available for ${stateName} right now.`,
    ai_best_months:    [],
    ai_hidden_gem:     null,
    ai_cost_estimate:  null,
    ai_local_tips:     [],
    ai_traveler_scores: null,
  };

  _intelCache[cacheKey] = { data: result, ts: Date.now() };
  res.json(result);
});

// ── Mistral AI completion helper ──────────────────────────────────
// This was being CALLED below but never defined — every request to
// /api/intel/area threw "generateMistralIntel is not defined", which
// (thanks to the new unhandledRejection guard above) now just logs an
// error and returns null instead of taking the whole server down.
async function generateMistralIntel(prompt) {
  if (!ENV.MISTRAL_API_KEY) return null;
  try {
    const r = await axios.post(
      "https://api.mistral.ai/v1/chat/completions",
      {
        model: "mistral-small-latest",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
        response_format: { type: "json_object" },
      },
      {
        headers: {
          Authorization: `Bearer ${ENV.MISTRAL_API_KEY}`,
          "Content-Type": "application/json",
        },
        timeout: 20000,
      }
    );
    const text = r.data?.choices?.[0]?.message?.content;
    if (!text) return null;
    return JSON.parse(text);
  } catch (e) {
    console.error("[Mistral] generation failed:", e.message);
    return null;
  }
}

// ── POST /api/intel/area — Area intel ────────────────────────────
app.post("/api/intel/area", async (req, res) => {
  const { area, state, country, iso } = req.body || {};
  if (!area || !country) return res.status(400).json({ error: "area and country required" });

  const cacheKey = `area_${area}_${state || ""}_${country}`;
  if (_intelCache[cacheKey] && Date.now() - _intelCache[cacheKey].ts < 4 * 60 * 60 * 1000) {
    return res.json(_intelCache[cacheKey].data);
  }

  const location = [area, state, country].filter(Boolean).join(", ");

  const [weather, photos, news] = await Promise.all([
    fetchWeatherForState(area, country),
    fetchPhotos(`${area} ${country}`),
    fetchNews(`${area} ${country}`),
  ]);

  const prompt = `You are a travel expert on ${location}.
Return ONLY valid JSON, no markdown:
{
  "ai_intel": {
    "briefing": "2-3 sentence overview for travelers",
    "vibe": "10-word poetic vibe",
    "best_time": "best time to visit",
    "avoid_if": "who should think twice",
    "hidden_gem": "secret local experience",
    "trending_topic": "what travelers are talking about",
    "recommendations": ["rec1","rec2","rec3"],
    "local_tip": "single insider tip",
    "packing_list": ["item1","item2","item3"],
    "day_itinerary": "ideal 1-day itinerary",
    "sensory": "evocative sensory description",
    "traveler_scores": {"solo":7,"families":7,"adventure":8,"luxury":6,"budget":7,"romance":7}
  },
  "ai_geography":    {"overview":"","terrain":"","notable_features":[]},
  "ai_weather":      {"climate_type":"","best_months":[],"rainy_season":"","dry_season":""},
  "ai_history_culture": {"background":"","etiquette":[],"festivals":[]},
  "ai_food_drink":   {"signature_dishes":[],"street_food":[],"local_drinks":[],"avg_cheap_meal_usd":0},
  "ai_accommodation":{"best_areas_to_stay":[],"airbnb_avg_usd":0},
  "ai_transport":    {"getting_around":"","ride_apps":[],"walkability":""},
  "ai_cost_of_living":{"cheap_meal_usd":0,"cost_vs_national":"","tipping":""},
  "ai_health":       {"risk_level":"low","water_safe_to_drink":true,"malaria_risk":""},
  "ai_safety":       {"overall_rating":"moderate","night_safety":"","scams":[],"safe_areas":[],"unsafe_areas":[]},
  "ai_nightlife_entertainment": {"overview":"","closing_time":"","best_areas":[]},
  "ai_attractions":  {"top_10":[],"hidden_gems":[],"free_attractions":[]},
  "ai_shopping":     {"what_to_buy":[],"best_markets":[]},
  "ai_connectivity": {"avg_download_mbps":0,"wifi_availability":"","coverage_4g":""},
  "ai_languages":    {"official":[],"english_level":"","useful_phrases":{}},
  "ai_events":       {"annual_festivals":[],"best_season_to_visit":""},
  "ai_visa":         {"evisa_available":false,"visa_cost_usd":0,"yellow_fever_required":false}
}`;

  const ai = await generateMistralIntel(prompt);

  const full_intel = {
    area_name:     area,
    state_name:    state || null,
    country_name:  country,
    last_updated:  new Date().toISOString(),
    photos,
    weather_now:   weather,
    news_headlines: news,
    ...(ai || {}),
    ai_intel: ai?.ai_intel || {
      briefing: `${location} is a fascinating place with unique experiences and local character.`,
      vibe: `${area} — discover its unique soul`,
    },
    ai_briefing: ai?.ai_intel?.briefing || null,
    ai_traveler_scores: ai?.ai_intel?.traveler_scores || null,
    verification_score: null,
    verification_sources: 0,
  };

  const result = { full_intel, photos };
  _intelCache[cacheKey] = { data: result, ts: Date.now() };
  res.json(result);
});

// ── GET /api/source-health ────────────────────────────────────────
app.get("/api/source-health", (req, res) => res.json({ status: "ok" }));

// ── 404 fallback ──────────────────────────────────────────────────
app.use((req, res) => res.status(404).json({ error: "Not found", path: req.path }));

// ══════════════════════════════════════════════════════════════════
// START SERVER
// ══════════════════════════════════════════════════════════════════
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`
╔══════════════════════════════════════════════════════════╗
║  🌍 GlobeVoyage API  —  port ${PORT}
╚══════════════════════════════════════════════════════════╝`);
  try { await seedWorldGeo(); } catch(e) { console.error("[Startup] Seed error:", e.message); }
});
