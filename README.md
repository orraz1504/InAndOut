# אישורי כניסה ויציאה – בית ספר

אפליקציית SPA סטטית (HTML + Tailwind CDN + JS נקי). ללא npm / build. מסד נתונים: **Firebase Firestore** עם סנכרון חי (`onSnapshot`).

## קבצים
| קובץ | תפקיד |
|---|---|
| `index.html` | המבנה והעיצוב (RTL, Tailwind CDN) |
| `app.js` | כל הלוגיקה |
| `firebase-config.js` | **כאן שמים את מפתחות החיבור** |
| `firestore.rules` | כללי אבטחה להדבקה ב-Firebase Console |


## הקמה (5 דקות)
1. [console.firebase.google.com](https://console.firebase.google.com) → **Add project**.
2. **Build → Firestore Database → Create database** (מיקום `eur3` / `me-west1`).
3. **Project settings → General → Your apps → `</>` (Web)** → העתיקו את אובייקט ה-`firebaseConfig` אל `firebase-config.js` (במקום ערכי ה-`YOUR_...`).
4. **Firestore → Rules** → הדביקו את תוכן `firestore.rules` → Publish.
5. **Build → Authentication → Sign-in method → Google** → Enable (ובחרו Support email).
6. **Authentication → Settings → Authorized domains** → הוסיפו את הדומיין של האתר (למשל `yourname.github.io`).
7. אימייל המנהל מוגדר ב-`adminEmails` (`firebase-config.js`) **וגם** בפונקציה `isAdmin()` ב-`firestore.rules`. אם משנים – לשנות בשני המקומות.
8. העלו את התיקייה כמות שהיא ל-GitHub Pages / Cloudflare Pages.

## מי מורשה להשתמש (מסך "ניהול")
- **כל חשבון Google יכול להתחבר.** מי שאינו מורשה רואה מסך "ממתין לאישור המנהל" ולא ניגש לשום נתון.
- בכניסה ראשונה נוצר אוטומטית מסמך `users/<email>` בסטטוס `pending`. המנהל רואה תג אדום בלשונית **👥 ניהול**, ומאשר / חוסם. השינוי חל מיד, גם על מי שכבר מחובר.
- אפשר גם לאשר אימייל **מראש**, לפני שהמשתמש התחבר, בטופס בראש מסך הניהול.
- **מנהל** (`adminEmails`) לא צריך אישור. רק הוא רואה את טבלאות האישורים ואת מסך הניהול, ורק הוא יכול למחוק.
- **שומר** רואה את יציאות היום ואת היציאות העתידיות (לצפייה בלבד).
- חשוב: משתמש מורשה (למשל שומר) יכול לקרוא את הנתונים כדי לעבוד, לכן ההסתרה של הטבלאות ממנו היא ברמת הממשק. הכללים מונעים גישה מכל מי שלא אושר.
- ה-`apiKey` של Firebase Web אינו סוד – מי שמאבטח את הנתונים הם **כללי Firestore**.

בלי מפתח Firebase אמיתי האפליקציה רצה במצב הדגמה (localStorage בדפדפן בלבד). כניסת מנהל בהדגמה: האימייל הראשון ב-`adminEmails` והסיסמה `demoAdminPassword` – הדמיה בלבד, לא אבטחה.

## מבנה הנתונים
- `student_exits`: `studentName, grade, exitDate (YYYY-MM-DD), exitTime (HH:MM), approvedBy, status, actualExitAt, guardName, createdAt`
  סטטוסים: `ממתין ליציאה` / `יצא בפועל` / `בוטל`
- `users` (מזהה = האימייל באותיות קטנות): `email, name, status (pending / approved / blocked), createdAt`
- `visitor_entries`: `firstName, lastName, idNumber, purpose, escortRequired, armedAllowed, approvedBy, visitDate, status, entryAt, exitAt, guardName, exitGuardName, createdAt`
  סטטוסים: `טרם נכנס` / `נמצא בשטח` / `יצא`

ה-`id` הוא מזהה המסמך ב-Firestore. אין צורך ביצירת אינדקסים.
