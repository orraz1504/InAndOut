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
- **מי יכול לערוך רשומה** (נאכף ב-`firestore.rules`, לא רק בממשק): מנהל – הכול; יוצר הרשומה (`createdBy`) – עריכה מלאה של הרשומות שיצר, בלי לשנות את `createdBy`; שומר – רק שדות הכניסה/יציאה (סטטוס, זמנים, שם שומר) של כל רשומה. יצירה אפשרית רק על שמך (`createdBy` = האימייל שלך). רשומות ישנות בלי `createdBy` – מנהל ושומר בלבד. מחיקה – מנהל בלבד.
- **בדיקות תקינות בכללים:** כל כתיבה נבדקת ב-`firestore.rules` – רק שדות מוכרים (`hasOnly`), שדות חובה, סוגים (מחרוזת / מספר / בוליאני), אורכי מקסימום, תאריך `YYYY-MM-DD`, שעה `HH:MM`, וערכי סטטוס ותפקיד מהרשימה המותרת בלבד. רשומה חדשה חייבת להתחיל במצב התחלתי (ממתין / טרם נכנס, בלי שומר וזמנים). `createdBy` ו-`createdAt` לא משתנים אחרי היצירה. שומר לא יכול לבטל אישור או לגעת באישור שבוטל. **אם מוסיפים שדה חדש לרשומה – חובה להוסיף אותו גם לרשימות ב-`validStudent` / `validVisitor` / `validUser`, אחרת הכתיבה תידחה.** זמנים נשמרים כמספר (מילישניות), לא כ-Timestamp של Firestore.
- **שם המאשר נעול:** בטפסים שדה "שם הגורם המאשר" הוא לקריאה בלבד ומתמלא אוטומטית מהשם של המשתמש המחובר – השם שהמנהל הגדיר לו במסך "ניהול", ובהעדרו שם חשבון ה-Google. הכללים אוכפים זאת בשרת: `approvedBy` ברשומה חדשה חייב להיות אותו שם, ורק מנהל יכול לשנות מאשר ברשומה קיימת (בטופס העריכה שלו). רשומות ישנות לא משתנות כששמו של משתמש משתנה. אם נותנים למשתמש שם חדש – מהרגע הזה הוא רושם רק בשם החדש.
- **שם השומר נעול באותו אופן:** בעמדת השומר שדה "שם השומר" לקריאה בלבד ומתמלא מהשם של המשתמש המחובר. הכללים אוכפים זאת: `guardName` / `exitGuardName` אפשר לכתוב רק בשם שלך, או לרוקן (ביטול רישום יציאה); מנהל פטור ויכול לתקן.
- **עדכון הכללים:** אחרי כל שינוי ב-`firestore.rules` יש להדביק אותם ב-Firebase Console → Firestore → Rules → Publish. סדר הפעולות: קודם להעלות את האתר (שכותב `createdBy`), ורק אחר כך לפרסם את הכללים – אחרת יצירת רשומות מגרסה ישנה של האתר תיכשל.
- ה-`apiKey` של Firebase Web אינו סוד – מי שמאבטח את הנתונים הם **כללי Firestore**.

בלי מפתח Firebase אמיתי האפליקציה רצה במצב הדגמה (localStorage בדפדפן בלבד). כניסת מנהל בהדגמה: האימייל הראשון ב-`adminEmails` והסיסמה `demoAdminPassword` – הדמיה בלבד, לא אבטחה.

## מבנה הנתונים
- `student_exits`: `studentName, grade, exitDate (YYYY-MM-DD), exitTime (HH:MM), approvedBy, status, actualExitAt, guardName, createdAt, createdBy`
  סטטוסים: `ממתין ליציאה` / `יצא בפועל` / `בוטל`
- `users` (מזהה = האימייל באותיות קטנות): `email, name, status (pending / approved / blocked), role (staff / guard / admin), createdAt, addedBy`
  `name` נלקח בהתחברות הראשונה משם חשבון ה-Google, והמנהל יכול לשנות אותו במסך "ניהול" (לא חובה). הוא מוצג בסרגל העליון של המשתמש ומתמלא אוטומטית כשם המאשר / השומר; ריק = שם חשבון ה-Google. רשומות שכבר נוצרו לא משתנות.
- `visitor_entries`: `firstName, lastName, idNumber, purpose, escortRequired, armedAllowed, approvedBy, visitDate, notes, status, entryAt, exitAt, guardName, exitGuardName, createdAt, createdBy`
  סטטוסים: `טרם נכנס` / `נמצא בשטח` / `יצא`

ה-`id` הוא מזהה המסמך ב-Firestore. אין צורך ביצירת אינדקסים.
