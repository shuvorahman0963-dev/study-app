# Study App — চালানো ও ফ্রি হোস্টিং গাইড

## ১. কম্পিউটারে চালানো

```bash
cd "C:\Users\AR Shuvo\OneDrive\Documents\l2t2\Wp\study-app"
npm run dev
```
ব্রাউজারে খুলুন: http://localhost:5173

অফলাইন/ইনস্টল টেস্ট করতে (আসল বিল্ড):
```bash
npm run build
npm run preview
```
তারপর http://localhost:4173 খুলুন।

---

## ২. GitHub Pages-এ ফ্রি হোস্টিং (একবার সেটআপ)

**যা লাগবে:** একটা GitHub অ্যাকাউন্ট আর কম্পিউটারে Git ইনস্টল করা (https://git-scm.com)।

1. https://github.com/new এ গিয়ে নতুন repository বানান — নাম দিন `study-app`, **Public**, কোনো README যোগ করবেন না → **Create repository**।
2. `study-app` ফোল্ডারে Terminal খুলে একটা একটা করে চালান (`<USERNAME>` এর জায়গায় আপনার GitHub username):
   ```bash
   git init
   git add .
   git commit -m "Study app"
   git branch -M main
   git remote add origin https://github.com/<USERNAME>/study-app.git
   git push -u origin main
   ```
3. GitHub-এ repository → **Settings → Pages** → "Build and deployment" এর **Source**: **GitHub Actions** বেছে নিন।
4. **Actions** ট্যাবে "Deploy to GitHub Pages" চলবে (২–৩ মিনিট)। সবুজ ✓ হলে অ্যাপ এখানে পাবেন:
   **https://&lt;USERNAME&gt;.github.io/study-app/**

পরে কোড বদলালে শুধু:
```bash
git add .
git commit -m "update"
git push
```
— নিজে থেকেই আবার deploy হবে।

> ⚠️ Repository public হলেও আপনার পড়ার ডাটা (কার্ড, রিভিউ) GitHub-এ যায় না — সেটা শুধু আপনার ডিভাইসের ব্রাউজারে থাকে। `study-data` ফোল্ডার এই repository-র বাইরে, তাই সেটাও আপলোড হবে না।

### বিকল্প: Vercel
https://vercel.com এ GitHub দিয়ে লগইন → **Add New → Project** → `study-app` repository Import → Framework: **Vite** → **Deploy**। লিংক পাবেন `https://study-app-xxxx.vercel.app`।

---

## ৩. Android ফোনে ইনস্টল

1. ফোনে **Chrome** দিয়ে আপনার লিংক খুলুন।
2. অ্যাপে "📲 Install app" বাটন আসলে চাপুন, না আসলে Chrome মেনু (⋮) → **Add to Home screen / Install app**।
3. Home screen-এ "Study" আইকন আসবে — একবার খোলার পর ইন্টারনেট ছাড়াও চলবে।
4. Settings → **🔔 Enable notifications** চাপুন (timer ও bedtime এর জন্য)।

## ৪. ফোন ↔ কম্পিউটারে ডাটা নেওয়া

- **পাঠানো ডিভাইসে:** Settings → **⬇️ Export** (বা ফোনে **📤 Share** → Drive/WhatsApp)।
- **নেওয়া ডিভাইসে:** Settings → **♻️ Restore from backup** → ফাইলটা বেছে নিন।
- ⚠️ Restore করলে সেই ডিভাইসের আগের সব ডাটা মুছে backup-এর ডাটা বসে। তাই সবসময় **যে ডিভাইসে সর্বশেষ পড়েছেন** সেখান থেকে Export করুন।
- নিয়মিত (সপ্তাহে ১–২ বার) Export করে রাখুন — ব্রাউজারের ডাটা মুছলে backup ছাড়া ফেরত পাওয়া যাবে না।
