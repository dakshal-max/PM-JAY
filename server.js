const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

app.use(cors());
app.use(express.json());

// Health Check for Render deployment
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', app: 'AyushmanHub' });
});

function haversineDistance(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return 2.5;
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

// ---------------------------------------------------------
// 1. ELIGIBILITY API
// ---------------------------------------------------------
app.post('/api/eligibility/check', (req, res) => {
  const { age, state, identifier, flags } = req.body;

  if (!age || isNaN(age) || age < 0 || age > 120) {
    return res.status(400).json({ success: false, error: 'Invalid age' });
  }

  if (!identifier || String(identifier).trim().length < 10) {
    return res.status(400).json({ success: false, error: 'Identifier must be at least 10 characters/digits' });
  }

  const ageNum = Number(age);
  const isSenior70Plus = ageNum >= 70;
  const flagCount = Array.isArray(flags) ? flags.length : 0;
  const isEligible = isSenior70Plus || flagCount > 0;

  let reason = '';
  if (isSenior70Plus) {
    reason = 'Qualifies under Ayushman Vay Vandana scheme for senior citizens (70+ years)';
  } else if (isEligible) {
    reason = 'Qualifies under Socio-Economic Caste Census (SECC) vulnerability criteria';
  } else {
    reason = 'Could not confirm automatic eligibility based on submitted criteria. Verification at CSC required.';
  }

  const checkRecord = {
    id: 'CHK-' + Math.floor(100000 + Math.random() * 900000),
    age: ageNum,
    state: state || 'Other',
    identifier: String(identifier).trim(),
    flags: flags || [],
    isEligible,
    isSenior70Plus,
    reason,
    timestamp: new Date().toISOString()
  };

  const checks = db.get('eligibilityChecks') || [];
  checks.push(checkRecord);
  db.set('eligibilityChecks', checks);

  return res.json({
    success: true,
    data: checkRecord
  });
});

// ---------------------------------------------------------
// 2. CLAIM TRACKER API
// ---------------------------------------------------------
app.get('/api/claims', (req, res) => {
  const claimsObj = db.get('claims') || {};
  const claimsList = Object.values(claimsObj);
  return res.json({ success: true, data: claimsList });
});

app.get('/api/claims/:id', (req, res) => {
  const claimId = req.params.id.trim().toUpperCase();
  const claims = db.get('claims') || {};

  if (claims[claimId]) {
    return res.json({ success: true, data: claims[claimId] });
  }

  if (claimId.length >= 6) {
    let charSum = 0;
    for (let i = 0; i < claimId.length; i++) {
      charSum += claimId.charCodeAt(i);
    }
    const stage = charSum % 4;
    const stages = ['Claim submitted', 'Documents verified', 'Claim approved', 'Payment released'];

    const mockClaim = {
      id: claimId,
      patientName: 'Beneficiary ' + claimId.slice(-4),
      hospitalName: 'Empaneled Regional Hospital',
      procedure: 'General Surgery / Inpatient Treatment',
      category: 'Inpatient Care',
      amountClaimed: 45000 + (charSum * 10) % 50000,
      amountApproved: stage >= 2 ? 45000 + (charSum * 10) % 50000 : 0,
      statusStage: stage,
      statusText: stages[stage],
      timeline: [
        { stage: 'Claim submitted', date: '2026-09-25 10:00 AM', completed: stage >= 0, remark: 'Submitted via IT portal' },
        { stage: 'Documents verified', date: stage >= 1 ? '2026-09-26 02:30 PM' : 'Pending', completed: stage >= 1, remark: 'SECC & Aadhaar verified' },
        { stage: 'Claim approved', date: stage >= 2 ? '2026-09-28 11:15 AM' : 'Pending', completed: stage >= 2, remark: 'Medical desk pre-auth approved' },
        { stage: 'Payment released', date: stage >= 3 ? '2026-09-30 04:00 PM' : 'Pending', completed: stage >= 3, remark: 'PFMS portal transfer completed' }
      ]
    };

    return res.json({ success: true, data: mockClaim });
  }

  return res.status(404).json({ success: false, error: 'Claim ID not found' });
});

app.post('/api/claims', (req, res) => {
  const { patientName, hospitalName, procedure, amountClaimed, category } = req.body;
  if (!patientName || !hospitalName || !procedure) {
    return res.status(400).json({ success: false, error: 'Missing required claim details' });
  }

  const claimId = 'PMJAY-' + Math.floor(10000 + Math.random() * 90000);
  const newClaim = {
    id: claimId,
    patientName,
    hospitalName,
    procedure,
    category: category || 'General Care',
    amountClaimed: Number(amountClaimed) || 50000,
    amountApproved: Number(amountClaimed) || 50000,
    statusStage: 0,
    statusText: 'Claim Submitted',
    statusTextHi: 'क्लेम जमा',
    submissionDate: new Date().toISOString().split('T')[0],
    timeline: [
      { stage: 'Claim submitted', date: new Date().toLocaleString(), completed: true, remark: 'Fresh claim created' },
      { stage: 'Documents verified', date: 'Pending', completed: false, remark: 'Pending audit' },
      { stage: 'Claim approved', date: 'Pending', completed: false, remark: 'Awaiting approval' },
      { stage: 'Payment released', date: 'Pending', completed: false, remark: 'Awaiting disburse' }
    ]
  };

  const claims = db.get('claims') || {};
  claims[claimId] = newClaim;
  db.set('claims', claims);

  return res.json({ success: true, data: newClaim });
});

// ---------------------------------------------------------
// 3. HOSPITALS API
// ---------------------------------------------------------
app.get('/api/hospitals', (req, res) => {
  const pin = (req.query.pin || '').trim();
  const state = (req.query.state || '').trim();
  const city = (req.query.city || '').trim();
  const subcity = (req.query.subcity || req.query.locality || '').trim();
  const query = (req.query.q || '').trim().toLowerCase();
  const userLat = parseFloat(req.query.lat);
  const userLng = parseFloat(req.query.lng);

  let hospitals = db.get('hospitals') || [];

  if (state) {
    hospitals = hospitals.filter(h => h.state.toLowerCase() === state.toLowerCase());
  }

  if (city && city.toLowerCase() !== 'all cities') {
    hospitals = hospitals.filter(h =>
      (h.city && h.city.toLowerCase() === city.toLowerCase()) ||
      (h.district && h.district.toLowerCase().includes(city.toLowerCase()))
    );
  }

  if (subcity && subcity.toLowerCase() !== 'all sub-cities' && subcity.toLowerCase() !== 'all localities') {
    hospitals = hospitals.filter(h =>
      (h.subcity && h.subcity.toLowerCase() === subcity.toLowerCase()) ||
      (h.address && h.address.toLowerCase().includes(subcity.toLowerCase())) ||
      (h.name && h.name.toLowerCase().includes(subcity.toLowerCase()))
    );
  }

  if (pin) {
    hospitals = hospitals.filter(h => h.pin === pin);
  }

  if (query) {
    hospitals = hospitals.filter(h =>
      h.name.toLowerCase().includes(query) ||
      (h.nameHi && h.nameHi.toLowerCase().includes(query)) ||
      h.address.toLowerCase().includes(query) ||
      (h.subcity && h.subcity.toLowerCase().includes(query)) ||
      (h.specialties || []).some(s => s.toLowerCase().includes(query))
    );
  }

  if (!isNaN(userLat) && !isNaN(userLng)) {
    hospitals = hospitals.map(h => {
      const dist = haversineDistance(userLat, userLng, h.lat, h.lng);
      return { ...h, distanceKm: dist };
    });
    hospitals.sort((a, b) => a.distanceKm - b.distanceKm);
  }

  if (hospitals.length === 0 && (pin.length === 6 || subcity)) {
    const locName = subcity || (pin ? `PIN ${pin}` : 'Selected Locality');
    hospitals = [
      { id: `HOSP-SUB-1`, name: `Apex Specialty Hospital, ${locName}`, nameHi: `एपेक्स अस्पताल, ${locName}`, pin: pin || '410210', city: city || 'Mumbai & Metropolitan Region', subcity: subcity || 'Navi Mumbai', state: state || 'Maharashtra', type: 'Private Empaneled', distanceKm: 1.5, phone: '022-27745500', address: `Main Sector Road, ${locName}`, specialties: ['General Medicine', 'Orthopedics', 'Pediatrics'], cashlessAvailable: true, empanelmentId: `PRI-SUB-01` },
      { id: `HOSP-SUB-2`, name: `City Care Hospital, ${locName}`, nameHi: `सिटी केयर अस्पताल, ${locName}`, pin: pin || '410210', city: city || 'Mumbai & Metropolitan Region', subcity: subcity || 'Navi Mumbai', state: state || 'Maharashtra', type: 'Private Empaneled', distanceKm: 3.2, phone: '022-27822203', address: `Station Road, ${locName}`, specialties: ['Cardiology', 'Dialysis', 'Maternity'], cashlessAvailable: true, empanelmentId: `PRI-SUB-02` }
    ];
  }

  return res.json({ success: true, count: hospitals.length, data: hospitals });
});

// ---------------------------------------------------------
// 4. FAMILY CARD MANAGEMENT API
// ---------------------------------------------------------
app.get('/api/family', (req, res) => {
  const cards = db.get('familyCards') || {};
  const defaultCard = cards['DEFAULT'] || { cardId: 'AYUSH-8849-2026', totalCover: 500000, usedAmount: 120000, members: [] };
  return res.json({ success: true, data: defaultCard });
});

app.post('/api/family/member', (req, res) => {
  const { name, age, gender, relationship } = req.body;
  if (!name || !age) {
    return res.status(400).json({ success: false, error: 'Name and age are required' });
  }

  const cards = db.get('familyCards') || {};
  const defaultCard = cards['DEFAULT'] || { cardId: 'AYUSH-8849-2026', totalCover: 500000, usedAmount: 120000, members: [] };

  const newMember = {
    id: Date.now(),
    name: String(name).trim(),
    age: Number(age),
    gender: gender || 'Other',
    relationship: relationship || 'Family Member'
  };

  defaultCard.members.push(newMember);
  cards['DEFAULT'] = defaultCard;
  db.set('familyCards', cards);

  return res.json({ success: true, data: defaultCard });
});

app.delete('/api/family/member/:id', (req, res) => {
  const memberId = Number(req.params.id);
  const cards = db.get('familyCards') || {};
  const defaultCard = cards['DEFAULT'];

  if (defaultCard && Array.isArray(defaultCard.members)) {
    defaultCard.members = defaultCard.members.filter(m => m.id !== memberId);
    cards['DEFAULT'] = defaultCard;
    db.set('familyCards', cards);
  }

  return res.json({ success: true, data: defaultCard });
});

// ---------------------------------------------------------
// 5. TREATMENTS API
// ---------------------------------------------------------
app.get('/api/treatments', (req, res) => {
  const treatments = db.get('treatments') || [];
  return res.json({ success: true, data: treatments });
});

// ---------------------------------------------------------
// 6. GRIEVANCE API
// ---------------------------------------------------------
app.post('/api/grievances', (req, res) => {
  const { category, description, hospitalName, contact } = req.body;
  if (!description || !description.trim()) {
    return res.status(400).json({ success: false, error: 'Please describe the issue' });
  }

  const grvId = 'GRV-' + Math.floor(100000 + Math.floor(Math.random() * 900000));
  const newGrievance = {
    id: grvId,
    category: category || 'Hospital asked for money',
    description: description.trim(),
    hospitalName: hospitalName || 'Not specified',
    contact: contact || 'N/A',
    status: 'Registered',
    assignedOfficer: 'District Nodal Officer (DNO)',
    createdAt: new Date().toISOString()
  };

  const grievances = db.get('grievances') || [];
  grievances.push(newGrievance);
  db.set('grievances', grievances);

  return res.json({ success: true, grievanceId: grvId, data: newGrievance });
});

app.get('/api/grievances/:id', (req, res) => {
  const grvId = req.params.id.trim().toUpperCase();
  const grievances = db.get('grievances') || [];
  const found = grievances.find(g => g.id === grvId);

  if (found) {
    return res.json({ success: true, data: found });
  }
  return res.status(404).json({ success: false, error: 'Grievance ID not found' });
});

// ---------------------------------------------------------
// 7. ASK SAATHI AI CHATBOT API
// ---------------------------------------------------------
app.post('/api/chat', (req, res) => {
  const { question, lang } = req.body;
  const q = (question || '').trim();

  if (!q) {
    return res.status(400).json({ success: false, error: 'Question is required' });
  }

  const isHindi = lang === 'hi' || /[\u0900-\u097F]/.test(q);
  let reply = '';

  if (/card|कार्ड|banaye|बनाएँ|बनवा|CSC|csc/i.test(q)) {
    reply = isHindi
      ? 'आयुष्मान कार्ड बनवाने के लिए आधार कार्ड और राशन कार्ड लेकर नज़दीकी कॉमन सर्विस सेंटर (CSC) या सूचीबद्ध सरकारी/निजी अस्पताल जाएँ। वहाँ आयुष्मान मित्र आपका मुफ़्त सत्यापन करेंगे।'
      : 'To get your Ayushman Card, visit your nearest Common Service Centre (CSC) or any empaneled hospital with your Aadhaar card and Ration card. Staff will verify your record and issue the card.';
  } else if (/free|cash|cost|pay|paisa|पैसा|मुफ्त|मुफ़्त|फीस/i.test(q)) {
    reply = isHindi
      ? 'हाँ! PM-JAY में शामिल सभी 1,900+ इलाज सूचीबद्ध अस्पतालों में 100% मुफ़्त और कैशलेस हैं। यदि कोई अस्पताल पैसे माँगे, तो टोल-फ़्री नंबर 14555 पर शिकायत दर्ज कराएँ।'
      : 'Yes! All 1,900+ covered procedures are 100% cashless at empaneled hospitals. You should never be asked to pay. Report any illegal payment demand by calling 14555.';
  } else if (/document|aadhaar|papers|दस्तावेज|कागज़/i.test(q)) {
    reply = isHindi
      ? 'आपको आवश्यक दस्तावेज: 1. आधार कार्ड, 2. राशन कार्ड (या परिवार पहचान पत्र), 3. आधार से लिंक मोबाइल नंबर। 70+ वरिष्ठ नागरिकों के लिए केवल उम्र का प्रमाण और आधार आवश्यक है।'
      : 'Required documents: 1. Aadhaar Card, 2. Ration Card or Family ID, 3. Mobile number linked with Aadhaar. Seniors 70+ only need Aadhaar and age proof.';
  } else if (/lakh|cover|कवर|लाख|limit/i.test(q)) {
    reply = isHindi
      ? 'PM-JAY योजना में हर पात्र परिवार को हर साल ₹5,00,000 (5 लाख रुपये) तक का स्वास्थ्य बीमा मुफ़्त मिलता है। यह राशि परिवार के सभी सदस्यों में साझा होती है।'
      : 'PM-JAY provides health coverage of up to ₹5,00,000 (5 Lakh Rupees) per family per year. There is no limit on family size or age limit.';
  } else if (/claim|status|क्लेम|ट्रैक/i.test(q)) {
    reply = isHindi
      ? 'आप इस पोर्टल पर "अपना क्लेम ट्रैक करें" सेक्शन में अस्पताल द्वारा दिया गया क्लेम ID (जैसे PMJAY-48210) डालकर अपनी लाइव स्थिति जाँच सकते हैं।'
      : 'You can track your hospital claim live on this website using the "Track your claim" tool by entering your Claim ID (e.g. PMJAY-48210).';
  } else if (/hospital|अस्पताल|पिन|pin|city|kharghar|vashi|panvel|navi mumbai|खारघर|वाशी/i.test(q)) {
    reply = isHindi
      ? 'आयुष्मान हब (AyushmanHub) में नवी मुंबई, खारघर, वाशी, पनवेल, अंधेरी, दादर सहित सभी शहरों में PM-JAY सूचीबद्ध अस्पताल उपलब्ध हैं।'
      : 'AyushmanHub provides empaneled PM-JAY hospitals in Navi Mumbai, Kharghar, Vashi, Panvel, Andheri, Dadar and all regions.';
  } else if (/70|senior|elderly|वय वंदना|बुज़ुर्ग/i.test(q)) {
    reply = isHindi
      ? '70 वर्ष या उससे अधिक आयु के सभी वरिष्ठ नागरिक "आयुष्मान वय वंदना" कार्ड के लिए पात्र हैं, चाहे उनकी पारिवारिक आय कुछ भी हो! उन्हें अलग से ₹5 लाख का सालाना कवर मिलता है।'
      : 'All senior citizens aged 70 and above qualify under Ayushman Vay Vandana card regardless of family income, receiving an exclusive ₹5 Lakh yearly cover!';
  } else {
    reply = isHindi
      ? `आपके सवाल "${q}" के संबंध में: आयुष्मान हब (AyushmanHub) पर भर्ती से पूर्व एवं पश्चात् की दवाएँ, जाँच तथा 1,900+ सर्जरी मुफ़्त हैं। अधिक जानकारी हेतु हेल्पलाइन 14555 पर कॉल करें।`
      : `Regarding your query "${q}": AyushmanHub covers pre and post hospitalization tests, medicines and 1,900+ procedures cashless up to ₹5 Lakh/year. You can also dial toll-free helpline 14555.`;
  }

  return res.json({ success: true, answer: reply });
});

// ---------------------------------------------------------
// 8. DOCUMENTS API
// ---------------------------------------------------------
app.get('/api/documents', (req, res) => {
  const docs = db.get('userDocuments') || {};
  return res.json({ success: true, data: docs['DEFAULT'] || [] });
});

app.post('/api/documents', (req, res) => {
  const { docs } = req.body;
  if (!Array.isArray(docs)) {
    return res.status(400).json({ success: false, error: 'Docs must be an array' });
  }
  const userDocs = db.get('userDocuments') || {};
  userDocs['DEFAULT'] = docs;
  db.set('userDocuments', userDocs);
  return res.json({ success: true, data: docs });
});

// ---------------------------------------------------------
// STATIC FILES & SPA ROUTING
// ---------------------------------------------------------
app.use(express.static(path.join(__dirname, 'public')));

app.get('*', (req, res) => {
  const indexPath = path.join(__dirname, 'public', 'index.html');
  res.sendFile(indexPath, (err) => {
    if (err) {
      console.error('Error sending index.html:', err);
      res.status(500).send('Error loading application page.');
    }
  });
});

app.listen(PORT, HOST, () => {
  console.log(`AyushmanHub Server running on http://${HOST}:${PORT}`);
});
