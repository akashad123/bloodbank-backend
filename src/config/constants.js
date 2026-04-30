const KERALA_DISTRICTS = [
  'Thiruvananthapuram',
  'Kollam',
  'Pathanamthitta',
  'Alappuzha',
  'Kottayam',
  'Idukki',
  'Ernakulam',
  'Thrissur',
  'Palakkad',
  'Malappuram',
  'Kozhikode',
  'Wayanad',
  'Kannur',
  'Kasaragod',
];

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

const ELIGIBILITY_GAP_DAYS = 90;

// District → major hospitals (for chatbot)
const DISTRICT_HOSPITALS = {
  Thiruvananthapuram: ['KIMS Hospital', 'SAT Hospital', 'Government Medical College'],
  Kollam: ['Bishop Benziger Hospital', 'Government District Hospital Kollam'],
  Pathanamthitta: ['Pushpagiri Medical College', 'Government District Hospital Pathanamthitta'],
  Alappuzha: ['Government Medical College Alappuzha', 'Baby Memorial Hospital'],
  Kottayam: ['Government Medical College Kottayam', 'Caritas Hospital'],
  Idukki: ['Government District Hospital Thodupuzha', 'Missionary Hospital Kuttapuzha'],
  Ernakulam: ['Amrita Institute', 'Lakeshore Hospital', 'Rajagiri Hospital'],
  Thrissur: ['Jubilee Mission Hospital', 'Government Medical College Thrissur'],
  Palakkad: ['Government District Hospital Palakkad', 'Sree Birla Hospital'],
  Malappuram: ['Government Medical College Manjeri', 'MES Medical College'],
  Kozhikode: ['Baby Memorial Hospital Calicut', 'Government Medical College Kozhikode'],
  Wayanad: ['Government District Hospital Kalpetta', 'Malabar Hospital Mananthavady'],
  Kannur: ['Government Medical College Kannur', 'Pariyaram Medical College'],
  Kasaragod: ['Government District Hospital Kasaragod', 'NIMS Medicity'],
};

module.exports = { KERALA_DISTRICTS, BLOOD_GROUPS, ELIGIBILITY_GAP_DAYS, DISTRICT_HOSPITALS };
