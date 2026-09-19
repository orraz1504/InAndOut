// ─────────────────────────────────────────────────────────────
// הגדרות החיבור ל-Firebase.
// Firebase Console → Project settings → General → Your apps → Web app → SDK setup and configuration → Config
//
// כל עוד apiKey מכיל "YOUR_" האפליקציה רצה במצב הדגמה מקומי (localStorage בלבד).
// מפתח ה-apiKey של Firebase Web אינו סוד; ההגנה על הנתונים נעשית ב-Firestore Rules (ראו firestore.rules).
// ─────────────────────────────────────────────────────────────
window.APP_CONFIG = {
  firebase: {
    apiKey: "AIzaSyCBMvcKFrVsQ0XO5uH-wL5Qrlaj5xrAoSY",
    authDomain: "inandout-9c99a.firebaseapp.com",
    projectId: "inandout-9c99a",
    storageBucket: "inandout-9c99a.firebasestorage.app",
    messagingSenderId: "186561801627",
    appId: "1:186561801627:web:154da6cd8e843a303d453e",
  },

  // מנהלים. כל חשבון Google יכול להתחבר, אבל רק מנהל רואה את טבלאות האישורים ואת מסך "ניהול",
  // שבו הוא מאשר או חוסם משתמשים. חשוב: אותה רשימה גם ב-firestore.rules (הפונקציה isAdmin).
  adminEmails: ["or.raz1504@gmail.com"],

  // מצב הדגמה בלבד (בלי Firebase): סיסמת "כניסת מנהל" עבור האימייל הראשון ב-adminEmails.
  demoAdminPassword: "admin",
};
