import { useState, useRef, useEffect, FormEvent } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Check, Send, MessageCircle, ArrowRight, User, Mail, Phone, MapPin, Briefcase, Code, Target, HelpCircle, ShieldCheck, Copy, ExternalLink, Fingerprint, Download, Camera, Upload, X, Lock, Key, LogOut, ChevronLeft, Save, AlertCircle, Search, Table, Loader2 } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { auth, db } from './lib/firebase';
import { 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  sendPasswordResetEmail,
  signOut,
  User as FirebaseUser,
  signInAnonymously
} from 'firebase/auth';
import { 
  doc, 
  setDoc, 
  getDoc, 
  getDocs,
  collection,
  serverTimestamp,
  increment
} from 'firebase/firestore';

const ADMIN_EMAILS = ['godwintext@gmail.com', 'info@nenifix.com'];

interface StudentData {
  full_name: string;
  email: string;
  phone: string | null;
  location_city: string;
  location_country: string;
  timezone_guess: string;
  current_role: string;
  coding_experience_level: string;
  primary_motivation: string;
  desired_outcome: string;
  referral_source: string;
  tos_agreement: boolean;
  free_resources_unlocked: boolean;
  telegram_community_shared: string;
  profile_picture?: string;
  email_verified?: boolean;
}

enum Step {
  GREETING = 'greeting',
  NAME = 'name',
  EMAIL = 'email',
  IMAGE = 'image',
  PHONE = 'phone',
  LOCATION = 'location',
  ROLE = 'role',
  CODING = 'coding',
  MOTIVATION = 'motivation',
  GOAL = 'goal',
  REFERRAL = 'referral',
  TOS = 'tos',
  CONFIRMATION = 'confirmation',
  VERIFICATION = 'verification',
  COMPLETED = 'completed'
}

export default function App() {
  const [mode, setMode] = useState<'enrollment' | 'login' | 'forgot_password' | 'auth_loading' | 'admin'>('auth_loading');
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [enrollments, setEnrollments] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [masterSpreadsheetId, setMasterSpreadsheetId] = useState('');
  const [isSyncActive, setIsSyncActive] = useState(false);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [currentStep, setCurrentStep] = useState<Step>(Step.GREETING);
  const [data, setData] = useState<Partial<StudentData>>({
    timezone_guess: Intl.DateTimeFormat().resolvedOptions().timeZone,
    telegram_community_shared: 'SkillsFix',
    free_resources_unlocked: false,
    tos_agreement: false,
  });
  const [inputValue, setInputValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [tempImage, setTempImage] = useState<string | null>(null);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isAdminUser = user && user.email && ADMIN_EMAILS.includes(user.email) && (user.emailVerified || user.providerData?.[0]?.providerId === 'google.com');

  const STORAGE_KEY = 'skillsfix_enrollment_v2';

  const stepsList = [
    Step.GREETING, Step.NAME, Step.EMAIL, Step.IMAGE, Step.PHONE, Step.LOCATION,
    Step.ROLE, Step.CODING, Step.MOTIVATION, Step.GOAL, Step.REFERRAL,
    Step.TOS, Step.CONFIRMATION, Step.VERIFICATION
  ];

  const currentIndex = stepsList.indexOf(currentStep);
  const progress = currentStep === Step.COMPLETED || mode !== 'enrollment' ? 100 : ((currentIndex + 1) / stepsList.length) * 100;

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const fetchAllEnrollments = async () => {
    if (!isAdminUser) return;
    setIsLoading(true);
    try {
      const q = collection(db, 'enrollments');
      const querySnapshot = await getDocs(q);
      const docs = querySnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setEnrollments(docs);

      // Fetch admin settings for sheets
      const settingsRef = doc(db, 'platform_settings', 'google_sheets');
      const settingsSnap = await getDoc(settingsRef);
      if (settingsSnap.exists()) {
        const s = settingsSnap.data();
        setMasterSpreadsheetId(s.spreadsheetId || '');
        setIsSyncActive(!!(s.spreadsheetId && s.tokens));
      }
    } catch (e) {
      console.error("Error fetching enrollments", e);
      setError("Failed to fetch administrative data.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      // Validate origin
      const origin = event.origin;
      if (!origin.endsWith('.run.app') && !origin.includes('localhost')) return;

      if (event.data?.type === 'GOOGLE_AUTH_SUCCESS') {
        const tokens = event.data.tokens;
        try {
          setIsLoading(true);
          
          if (mode === 'admin') {
            // This is an admin connecting for "Master Sync"
            const sheetId = masterSpreadsheetId || prompt("Enter the Google Spreadsheet ID to use for automated sync:");
            if (!sheetId) return;

            const response = await fetch('/api/admin/set-master-sheet', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ spreadsheetId: sheetId, tokens })
            });
            const result = await response.json();
            if (result.success) {
              setMasterSpreadsheetId(sheetId);
              setIsSyncActive(true);
              setError("Automated sync is now ACTIVE for this spreadsheet!");
            }
          } else {
            // Standard manual export
            const response = await fetch('/api/export/google-sheets', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ tokens, enrollments })
            });
            const result = await response.json();
            if (result.success) {
              window.open(result.spreadsheetUrl, '_blank');
              setError("Data successfully exported to Google Sheets!");
              setTimeout(() => setError(null), 5000);
            } else {
              setError("Sheets export failed: " + (result.error || "Unknown error"));
            }
          }
        } catch (e) {
          setError("Failed to communicate with sheets service.");
        } finally {
          setIsLoading(false);
        }
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [enrollments, mode, masterSpreadsheetId]);

  const handleExportToSheets = async () => {
    try {
      const response = await fetch('/api/auth/google/url');
      const { url } = await response.json();
      window.open(url, 'google_auth', 'width=600,height=700');
    } catch (e) {
      setError("Failed to initialize Google integration.");
    }
  };

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      setUser(fbUser);
      if (fbUser) {
        // Load from Firestore
        try {
          const docRef = doc(db, 'enrollments', fbUser.uid);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            const fbData = docSnap.data();
            setData(fbData.student_data || {});
            setCurrentStep(fbData.current_step as Step || Step.GREETING);
            setMode('enrollment');
          } else if (mode === 'auth_loading') {
            setMode('enrollment');
          }
        } catch (e) {
          console.error("Error loading profile", e);
          setMode('enrollment');
        }
      } else {
        if (mode === 'auth_loading') setMode('enrollment');
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [currentStep, isTyping]);

  // Load saved progress on mount
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const { savedData, savedStep } = JSON.parse(saved);
        if (savedData) setData(savedData);
        if (savedStep) setCurrentStep(savedStep);
        setLastSaved(new Date());
      } catch (e) {
        console.error("Failed to load saved progress", e);
      }
    }
  }, []);

  // Periodic auto-save every minute
  useEffect(() => {
    const interval = setInterval(() => {
      saveProgress();
    }, 60000);
    return () => clearInterval(interval);
  }, [data, currentStep]);

  const saveProgress = async (manualData?: any, manualStep?: Step) => {
    const dataToSave = manualData || data;
    const stepToSave = manualStep || currentStep;
    
    // Local Save
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      savedData: dataToSave,
      savedStep: stepToSave,
      timestamp: new Date().toISOString()
    }));
    setLastSaved(new Date());

    // Firestore Save
    if (user) {
      try {
        await setDoc(doc(db, 'enrollments', user.uid), {
          student_data: dataToSave,
          current_step: stepToSave,
          userId: user.uid,
          email: dataToSave.email || user.email || 'pending',
          updatedAt: serverTimestamp(),
          createdAt: serverTimestamp() // setDoc with merge or check if exists would be better for createdAt
        }, { merge: true });
      } catch (e) {
        console.error("Firestore save failed", e);
      }
    }
  };

  const handleAuthAction = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      if (mode === 'login') {
        await signInWithEmailAndPassword(auth, authEmail, authPassword);
        setMode('enrollment');
      } else if (mode === 'forgot_password') {
        await sendPasswordResetEmail(auth, authEmail);
        setError("Reset link sent! Please check your inbox.");
        setTimeout(() => setMode('login'), 3000);
      }
    } catch (e: any) {
      setError(e.message || "Authentication failed");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignOut = () => {
    signOut(auth);
    setMode('login');
    setData({
      timezone_guess: Intl.DateTimeFormat().resolvedOptions().timeZone,
      telegram_community_shared: 'SkillsFix',
      free_resources_unlocked: false,
      tos_agreement: false,
    });
    setCurrentStep(Step.GREETING);
  };

  const notifyAdmin = async (studentData: any, step: Step) => {
    try {
      await fetch('/api/enrollment-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student_data: studentData,
          current_step: step,
          timestamp: new Date().toISOString()
        })
      });
    } catch (e) {
      console.warn("Silent failure on admin notification:", e);
    }
  };

  const handleNext = () => {
    if (!inputValue && !tempImage && currentStep !== Step.GREETING && currentStep !== Step.PHONE && currentStep !== Step.TOS && currentStep !== Step.CONFIRMATION) return;
    
    navigateNext();
  };

  const handleGuestLogin = () => {
    setError(null);
    setIsLoading(true);
    
    // Simulate thinking before "logging in" guest
    setTimeout(() => {
      const guestData = {
        full_name: "Guest Explorer",
        email: "guest@skillsfix.net",
        profile_picture: "https://picsum.photos/seed/guest/200/200",
        phone: "+1 555 0199",
        location_city: "Digital Nomad",
        location_country: "AIFIX Platform",
        timezone_guess: Intl.DateTimeFormat().resolvedOptions().timeZone,
        current_role: "Product Explorer",
        coding_experience_level: "3",
        primary_motivation: "Exploring the SkillsFix curriculum and onboarding experience.",
        desired_outcome: "Understand how AIFIX empowers students through automated enrollment.",
        referral_source: "Direct Discovery",
        tos_agreement: true,
        free_resources_unlocked: true,
        telegram_community_shared: 'SkillsFix',
        email_verified: true,
      };
      setData(guestData);
      setCurrentStep(Step.COMPLETED);
      setIsLoading(false);
      saveProgress(guestData, Step.COMPLETED);
      notifyAdmin(guestData, Step.COMPLETED);
    }, 800);
  };

  const handleExportCSV = () => {
    setIsLoading(true);
    
    setTimeout(() => {
      const keys = Object.keys(data) as (keyof StudentData)[];
      const headers = ["platform", "company", "program", "timestamp", ...keys];
      const row = [
        "AIFIX",
        "NENIFIX",
        "SkillsFix",
        new Date().toISOString(),
        ...keys.map(key => `"${(data[key] || '').toString().replace(/"/g, '""')}"`)
      ];

      const csvContent = [headers.join(','), row.join(',')].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `skillsfix_enrollment_${data.full_name?.replace(/\s+/g, '_').toLowerCase() || 'new'}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setIsLoading(false);
    }, 600);
  };

  const handleSimulateReset = (e: FormEvent) => {
    e.preventDefault();
    handleAuthAction(e);
  };

  const navigateNext = async () => {
    // If not logged in, we should ideally prompt them to create an account or use anonymous
    if (!user) {
      try {
        await signInAnonymously(auth);
      } catch (e) {
        console.error("Anonymous sign in failed", e);
      }
    }

    // Email validation
    if (currentStep === Step.EMAIL) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(inputValue)) {
        setError("Please enter a valid email address (e.g., name@example.com)");
        return;
      }
    }

    // Phone validation (digits only, optional)
    if (currentStep === Step.PHONE && inputValue) {
      const phoneRegex = /^\d+$/;
      if (!phoneRegex.test(inputValue)) {
        setError("Please enter digits only for the phone number, or leave it blank to skip");
        return;
      }
    }

    setError(null);
    setIsTyping(true);
    setTimeout(() => {
      let nextStep: Step = currentStep;
      const updatedData = { ...data };

      switch (currentStep) {
        case Step.GREETING:
          nextStep = Step.NAME;
          break;
        case Step.NAME:
          updatedData.full_name = inputValue;
          nextStep = Step.EMAIL;
          break;
        case Step.EMAIL:
          updatedData.email = inputValue;
          nextStep = Step.IMAGE;
          break;
        case Step.IMAGE:
          updatedData.profile_picture = tempImage || undefined;
          nextStep = Step.PHONE;
          break;
        case Step.PHONE:
          updatedData.phone = inputValue || null;
          nextStep = Step.LOCATION;
          break;
        case Step.LOCATION:
          const locationParts = inputValue.split(',').map(s => s.trim());
          updatedData.location_city = locationParts[0] || inputValue;
          updatedData.location_country = locationParts[1] || '';
          nextStep = Step.ROLE;
          break;
        case Step.ROLE:
          updatedData.current_role = inputValue;
          nextStep = Step.CODING;
          break;
        case Step.CODING:
          updatedData.coding_experience_level = inputValue;
          nextStep = Step.MOTIVATION;
          break;
        case Step.MOTIVATION:
          updatedData.primary_motivation = inputValue;
          nextStep = Step.GOAL;
          break;
        case Step.GOAL:
          updatedData.desired_outcome = inputValue;
          nextStep = Step.REFERRAL;
          break;
        case Step.REFERRAL:
          updatedData.referral_source = inputValue;
          nextStep = Step.TOS;
          break;
        case Step.TOS:
          if (inputValue.toLowerCase() === 'yes' || inputValue.toLowerCase() === 'i agree') {
            updatedData.tos_agreement = true;
            updatedData.free_resources_unlocked = true;
            nextStep = Step.CONFIRMATION;
          } else {
            setIsTyping(false);
            return;
          }
          break;
        case Step.CONFIRMATION:
          nextStep = Step.VERIFICATION;
          break;
        case Step.VERIFICATION:
          updatedData.email_verified = true;
          nextStep = Step.COMPLETED;
          break;
      }

      setData(updatedData);
      setInputValue('');
      setTempImage(null);
      setCurrentStep(nextStep);
      setIsTyping(false);
      saveProgress(updatedData, nextStep);
      notifyAdmin(updatedData, nextStep);
    }, 600);
  };

  const getStepContent = (step: Step) => {
    switch (step) {
      case Step.GREETING:
        return "Welcome to SkillsFix by NENIFIX. Let's get you set up for the AI Training Program on the AIFIX platform. What's your full name?";
      case Step.NAME:
        return `Nice to meet you, ${data.full_name}. What email address should we use for program updates and login?`;
      case Step.EMAIL:
        return "Would you like to upload a profile picture for your SkillsFix ID? This helps our coaches recognize you in the sessions.";
      case Step.IMAGE:
        return "For urgent SMS announcements, may we have a mobile number? This is optional.";
      case Step.PHONE:
        return "Where are you joining us from? City and country, please.";
      case Step.LOCATION:
        return "What's your current occupation or field of study?";
      case Step.ROLE:
        return "On a scale of 1 (no coding) to 5 (professional developer), how would you rate your programming experience?";
      case Step.CODING:
        return "What's the main reason you're enrolling in SkillsFix?";
      case Step.MOTIVATION:
        return "What specific AI skill or project outcome do you hope to achieve?";
      case Step.GOAL:
        return "How did you hear about SkillsFix?";
      case Step.REFERRAL:
        return "By enrolling, you agree to the NENIFIX Terms of Service. This agreement is required to unlock your free SkillsFix resources.\n\nDo you agree to the NENIFIX Terms of Service?";
      case Step.TOS:
        return "Your information will be securely backed up to our Google Sheets database for NENIFIX record-keeping. Is everything correct?";
      case Step.CONFIRMATION:
        return (
          <div className="space-y-4">
            <p className="text-xl font-light text-white/90">Identity Verification Required</p>
            <p className="text-sm text-[#8E8E93] leading-relaxed">
              We've sent a secure verification link to <span className="text-[#0A84FF] font-medium">{data.email}</span>. Please click the link in your email to activate your account and unlock the AIFIX community.
            </p>
          </div>
        );
      case Step.VERIFICATION:
      case Step.COMPLETED:
        const telegramLink = "https://t.me/skillsfix";
        const welcomeTemplate = `Hello everyone! 👋 I'm ${data.full_name}, and I just enrolled in SkillsFix. My primary goal is to achieve: "${data.desired_outcome}". Excited to be part of the AIFIX platform!`;

        return (
          <div className="space-y-12">
            <div className="space-y-4">
              <p className="text-xl leading-relaxed font-light text-white/90">
                You're officially enrolled in SkillsFix.
              </p>
              <p className="text-neutral-400 text-sm font-light">
                Join the live community for direct support and networking on the AIFIX platform.
              </p>
            </div>

            <div className="flex flex-col lg:flex-row gap-8 items-start">
              {/* Official SkillsFix Brand Card (Recreated from image) */}
              <div className="relative shrink-0 mx-auto lg:mx-0">
                {/* Chalkboard Background Simulation */}
                <div className="absolute inset-0 bg-[#0A0A0A] rounded-3xl overflow-hidden -m-4 p-4 border border-white/5">
                   <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg width='100' height='100' viewBox='0 0 100 100' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M10 10l20 20m10-10l-20 20m40-20l20 20m10-10l-20 20' stroke='white' stroke-width='0.5' fill='none'/%3E%3Ctext x='50' y='50' fill='white' font-size='8'%3EΣ f(x)%3C/text%3E%3C/svg%3E")`, backgroundSize: '150px' }} />
                </div>
                
                <div className="relative w-[300px] aspect-[1/1.8] bg-white rounded-[40px] flex flex-col items-center pt-16 pb-8 px-6 shadow-2xl">
                  {/* Floating Logo */}
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24 bg-gradient-to-br from-[#7B88FF] to-[#606BFF] rounded-full flex items-center justify-center border-[6px] border-[#1C1C1E] shadow-xl">
                    <span className="text-white text-4xl font-bold font-sans">S</span>
                  </div>

                  {/* QR Code */}
                  <div className="flex-1 flex flex-col items-center justify-center w-full">
                    <div className="p-2 bg-white rounded-xl mb-8">
                      <QRCodeSVG 
                        value={telegramLink}
                        size={180}
                        level="H"
                        fgColor="#1A2F2B"
                        imageSettings={{
                          src: "https://upload.wikimedia.org/wikipedia/commons/8/82/Telegram_logo.svg",
                          x: undefined,
                          y: undefined,
                          height: 40,
                          width: 40,
                          excavate: true,
                        }}
                      />
                    </div>
                    <div className="text-[#1A2F2B] font-black text-2xl tracking-tighter uppercase">
                      @SKILLSFIX
                    </div>
                  </div>

                  <a
                    href={telegramLink}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-6 w-full py-4 px-6 bg-[#0088CC] hover:bg-[#0077B5] text-white rounded-2xl flex items-center justify-center gap-2 font-bold transition-all shadow-lg"
                  >
                    Join Group <ExternalLink size={18} />
                  </a>
                </div>
              </div>

              {/* Action Sidebar */}
              <div className="flex-1 space-y-6 w-full">
                {/* Profile Preview if available */}
                {data.profile_picture && (
                  <div className="flex items-center gap-4 bg-[#2C2C2E] border border-[#38383A] p-4 rounded-3xl">
                    <img src={data.profile_picture} alt="Profile" className="w-12 h-12 rounded-full object-cover border-2 border-[#0A84FF]" />
                    <div>
                      <p className="text-white text-sm font-bold">{data.full_name}</p>
                      <p className="text-[#8E8E93] text-[10px] uppercase font-bold tracking-[0.1em]">Student Identity Verified</p>
                    </div>
                  </div>
                )}

                {/* Welcome Template Card */}
                <div className="bg-[#2C2C2E] border border-[#38383A] p-6 rounded-3xl flex flex-col">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                       <div className="w-2 h-2 rounded-full bg-blue-500" />
                       <span className="text-[10px] uppercase font-bold tracking-[0.1em] text-[#8E8E93]">Personalized Welcome</span>
                    </div>
                    <HelpCircle size={14} className="text-[#8E8E93]" />
                  </div>
                  <div className="bg-black/30 rounded-2xl p-5 mb-6 border border-white/5">
                    <p className="text-sm font-light text-white/80 leading-relaxed italic">
                      "{welcomeTemplate}"
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(welcomeTemplate);
                    }}
                    className="w-full py-4 px-4 bg-white text-black hover:bg-neutral-200 rounded-2xl text-sm font-bold flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
                  >
                    <Copy size={16} /> Copy Message
                  </button>
                </div>

                <div className="p-6 rounded-3xl border border-white/5 bg-white/5 space-y-2">
                   <p className="text-xs font-semibold text-neutral-400 tracking-wide uppercase">Next Steps</p>
                   <ul className="text-xs text-[#8E8E93] space-y-2 list-disc pl-4 font-light">
                     <li>Join the Telegram community using the card</li>
                     <li>Paste your welcome template to introduce yourself</li>
                     <li>Check your email for program curriculum details</li>
                   </ul>
                </div>
              </div>
            </div>
          </div>
        );
      default:
        return "";
    }
  };

  const renderInputArea = () => {
    if (currentStep === Step.COMPLETED) return null;

    if (currentStep === Step.TOS) {
      return (
        <div className="mt-12 flex gap-4">
          <button
            onClick={() => { setInputValue('I agree'); handleNext(); }}
            className="bg-white text-black px-8 py-3 rounded-full font-semibold text-sm hover:bg-neutral-200 focus:ring-2 focus:ring-[#0A84FF] focus:ring-offset-2 focus:ring-offset-black outline-none transition-all cursor-pointer"
          >
            I agree
          </button>
        </div>
      );
    }

    if (currentStep === Step.CODING) {
      return (
        <div className="mt-12 flex gap-3 max-w-sm">
          {[1, 2, 3, 4, 5].map((lvl) => (
            <button
              key={lvl}
              onClick={() => { setInputValue(lvl.toString()); handleNext(); }}
              className="flex-1 py-3 bg-transparent text-neutral-400 border border-[#38383A] rounded-xl font-mono hover:bg-white hover:text-black hover:border-white focus:ring-2 focus:ring-[#0A84FF] focus:border-transparent outline-none transition-all cursor-pointer"
            >
              {lvl}
            </button>
          ))}
        </div>
      );
    }

    if (currentStep === Step.IMAGE) {
      return (
        <div className="mt-12 flex flex-col gap-6">
          <input 
            type="file" 
            ref={fileInputRef} 
            className="hidden" 
            accept="image/*"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                const reader = new FileReader();
                reader.onloadend = () => {
                  setTempImage(reader.result as string);
                };
                reader.readAsDataURL(file);
              }
            }}
          />
          
          <div className="flex items-center gap-6">
            <div 
              onClick={() => fileInputRef.current?.click()}
              className="w-24 h-24 rounded-full border-2 border-dashed border-[#38383A] flex items-center justify-center cursor-pointer hover:border-[#0A84FF] transition-colors relative overflow-hidden group"
            >
              {tempImage ? (
                <>
                  <img src={tempImage} alt="Preview" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                    <Camera size={20} className="text-white" />
                  </div>
                </>
              ) : (
                <Camera size={24} className="text-[#48484A]" />
              )}
            </div>

            <div className="flex flex-col gap-3">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="bg-white text-black px-6 py-2 rounded-xl font-semibold text-xs flex items-center gap-2 hover:bg-neutral-200 focus:ring-2 focus:ring-[#0A84FF] focus:ring-offset-2 focus:ring-offset-black outline-none transition-all cursor-pointer"
              >
                <Upload size={14} /> {tempImage ? 'Change Photo' : 'Upload Photo'}
              </button>
              {tempImage ? (
                <button
                  onClick={handleNext}
                  className="bg-[#0A84FF] text-white px-6 py-2 rounded-xl font-semibold text-xs flex items-center justify-center gap-2 hover:bg-[#0071e3] focus:ring-2 focus:ring-[#0A84FF] focus:ring-offset-2 focus:ring-offset-black outline-none transition-all cursor-pointer shadow-lg shadow-blue-500/20"
                >
                  Continue <ArrowRight size={14} />
                </button>
              ) : (
                <button
                  onClick={handleNext}
                  className="bg-transparent border border-[#38383A] text-neutral-400 px-6 py-2 rounded-xl font-medium text-xs hover:text-white hover:border-white focus:ring-2 focus:ring-[#0A84FF] outline-none transition-all cursor-pointer"
                >
                  Skip for now
                </button>
              )}
            </div>
          </div>
          {tempImage && (
            <button 
              onClick={() => setTempImage(null)}
              className="text-[#8E8E93] text-[10px] uppercase tracking-widest font-bold flex items-center gap-1 hover:text-white transition-colors"
            >
              <X size={10} /> Remove photo
            </button>
          )}
        </div>
      );
    }

    if (currentStep === Step.GREETING) {
      return (
        <div className="mt-12 flex flex-col sm:flex-row gap-4">
          <button
            onClick={handleNext}
            className="bg-white text-black px-8 py-4 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-neutral-200 focus:ring-2 focus:ring-[#0A84FF] focus:ring-offset-2 focus:ring-offset-black outline-none transition-all cursor-pointer shadow-lg active:scale-[0.98]"
          >
            Begin Enrollment <ArrowRight size={18} />
          </button>
          <button
            onClick={handleGuestLogin}
            className="bg-transparent border border-white/20 text-white/80 px-8 py-4 rounded-2xl font-medium text-sm flex items-center justify-center gap-2 hover:bg-white/5 hover:text-white hover:border-white/40 focus:ring-2 focus:ring-[#0A84FF] outline-none transition-all cursor-pointer active:scale-[0.98]"
          >
            <Fingerprint size={18} className="text-blue-400" /> Continue as Guest
          </button>
        </div>
      );
    }

    if (currentStep === Step.CONFIRMATION) {
      return (
        <div className="mt-12">
          <button
            onClick={handleNext}
            className="bg-white text-black px-8 py-3 rounded-full font-semibold text-sm flex items-center gap-2 hover:bg-neutral-200 focus:ring-2 focus:ring-[#0A84FF] focus:ring-offset-2 focus:ring-offset-black outline-none transition-all cursor-pointer"
          >
            Confirm & Complete <Check size={18} />
          </button>
        </div>
      );
    }

    if (currentStep === Step.VERIFICATION) {
      return (
        <div className="mt-12 flex flex-col gap-6 ">
          <div className="space-y-4">
            <button
              onClick={handleNext}
              className="bg-[#32D74B] text-black px-8 py-4 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-[#28af3f] transition-all cursor-pointer shadow-lg active:scale-[0.98]"
            >
              <Mail size={18} /> I've Verified My Email
            </button>
            <button
              onClick={() => {
                setIsTyping(true);
                setTimeout(() => {
                  setIsTyping(false);
                  setError("Verification email resent to " + data.email);
                }, 1000);
              }}
              className="text-[#8E8E93] text-[10px] uppercase font-bold tracking-widest hover:text-white transition-colors"
            >
              Resend Verification Link
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="mt-12">
        <form
          onSubmit={(e) => { e.preventDefault(); handleNext(); }}
          className="relative group border-b-2 border-[#38383A] focus-within:border-[#0A84FF] focus-within:shadow-[0_4px_20px_rgba(10,132,255,0.1)] transition-all duration-300 pb-3 max-w-xl"
        >
          <input
            autoFocus
            type="text"
            value={inputValue}
            onChange={(e) => {
              setInputValue(e.target.value);
              if (error) setError(null);
            }}
            placeholder={currentStep === Step.PHONE ? "Optional mobile number..." : "Type your answer..."}
            className="w-full bg-transparent text-2xl font-light text-white outline-none placeholder:text-[#48484A]"
          />
          <button
            type="submit"
            disabled={!inputValue && currentStep !== Step.PHONE}
            className="absolute right-0 bottom-3 p-2 text-white/50 group-focus-within:text-[#0A84FF] transition-colors disabled:opacity-0"
          >
            <Send size={24} />
          </button>
        </form>
        {error && (
          <motion.p 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 text-sm text-[#FF453A] font-medium"
          >
            {error}
          </motion.p>
        )}
      </div>
    );
  };

  const navSteps = [
    { label: 'Profile', step: Step.NAME },
    { label: 'Contact', step: Step.EMAIL },
    { label: 'Identity', step: Step.IMAGE },
    { label: 'Location', step: Step.LOCATION },
    { label: 'Background', step: Step.ROLE },
    { label: 'Motivation', step: Step.GOAL },
    { label: 'Agreement', step: Step.TOS },
    { label: 'Verification', step: Step.VERIFICATION }
  ];

  return (
    <div className="h-screen w-full flex overflow-hidden bg-[#1C1C1E]">
      {/* Sidebar Panal */}
      <aside className="w-[280px] bg-black border-r border-[#38383A] p-10 flex flex-col shrink-0">
        <header className="mb-16">
          <p className="text-[11px] uppercase tracking-[0.1em] text-[#8E8E93] font-bold mb-2">Platform</p>
          <h2 className="text-xl font-bold tracking-tight text-white mb-1">AIFIX</h2>
          <p className="text-xs text-[#8E8E93] font-medium">by NENIFIX</p>
        </header>

        <nav className="space-y-4">
          <button 
            onClick={() => { setMode('enrollment'); setCurrentStep(Step.GREETING); }}
            className={`w-full flex items-center gap-4 transition-all duration-300 ${mode === 'enrollment' ? 'opacity-100' : 'opacity-40 hover:opacity-60'}`}
          >
            <div className={`w-6 h-6 rounded-full border flex items-center justify-center text-[10px] font-bold ${mode === 'enrollment' ? 'border-[#0A84FF] text-[#0A84FF]' : 'border-[#38383A] text-[#8E8E93]'}`}>
               {mode === 'enrollment' ? <User size={10} /> : 'E'}
            </div>
            <span className="text-sm font-medium tracking-tight text-[#FFFFFF]">Enrollment</span>
          </button>

          <button 
            onClick={() => setMode('login')}
            className={`w-full flex items-center gap-4 transition-all duration-300 ${mode !== 'enrollment' ? 'opacity-100' : 'opacity-40 hover:opacity-60'}`}
          >
            <div className={`w-6 h-6 rounded-full border flex items-center justify-center text-[10px] font-bold ${mode !== 'enrollment' ? 'border-[#32D74B] text-[#32D74B]' : 'border-[#38383A] text-[#8E8E93]'}`}>
              {mode !== 'enrollment' ? <Lock size={10} /> : 'L'}
            </div>
            <span className="text-sm font-medium tracking-tight text-[#FFFFFF]">Member Login</span>
          </button>

          {isAdminUser && (
            <button 
              onClick={() => { setMode('admin'); fetchAllEnrollments(); }}
              className={`w-full flex items-center gap-4 transition-all duration-300 ${mode === 'admin' ? 'opacity-100' : 'opacity-40 hover:opacity-60'}`}
            >
              <div className={`w-6 h-6 rounded-full border flex items-center justify-center text-[10px] font-bold ${mode === 'admin' ? 'border-[#FF9500] text-[#FF9500]' : 'border-[#38383A] text-[#8E8E93]'}`}>
                <ShieldCheck size={10} />
              </div>
              <span className="text-sm font-medium tracking-tight text-[#FFFFFF]">Platform Backend</span>
            </button>
          )}

          <div className="pt-8 opacity-20 h-0 border-t border-white/20 my-4" />

          {user && (
            <div className="mb-6 p-4 bg-white/5 rounded-xl border border-white/10 space-y-3">
              <div className="flex items-center gap-3">
                <img src={user.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.uid}`} className="w-8 h-8 rounded-full bg-[#0A84FF]/20" />
                <div className="min-w-0">
                  <p className="text-[10px] font-bold text-white uppercase tracking-tight truncate">{user.displayName || user.email?.split('@')[0] || 'Member'}</p>
                  <p className="text-[9px] text-[#8E8E93] font-medium uppercase tracking-widest truncate">{user.isAnonymous ? 'Guest Account' : 'Verified Member'}</p>
                </div>
              </div>
              <button 
                onClick={handleSignOut}
                className="w-full flex items-center justify-center gap-2 py-2 bg-white/5 hover:bg-[#FF453A]/20 text-[#FF453A] rounded-lg transition-colors text-[9px] font-bold uppercase tracking-widest border border-[#FF453A]/20"
              >
                <LogOut size={10} /> Logout
              </button>
            </div>
          )}

          {mode === 'enrollment' && navSteps.map((s, i) => {
            const isCompleted = stepsList.indexOf(currentStep) > stepsList.indexOf(s.step);
            const isActive = currentStep === s.step || (stepsList.indexOf(currentStep) < stepsList.indexOf(s.step) && currentIndex > stepsList.indexOf(navSteps[i-1]?.step || Step.GREETING));
            
            return (
              <div key={s.label} className={`flex items-center gap-4 transition-opacity duration-500 ${isActive || isCompleted ? 'opacity-100' : 'opacity-40'}`}>
                <div className={`w-6 h-6 rounded-full border flex items-center justify-center text-[10px] font-bold ${
                  isCompleted ? 'border-[#32D74B] text-[#32D74B]' :
                  isActive ? 'border-[#0A84FF] text-[#0A84FF]' :
                  'border-[#38383A] text-[#8E8E93]'
                }`}>
                  {isCompleted ? <Check size={10} strokeWidth={4} /> : i + 1}
                </div>
                <span className="text-sm font-medium tracking-tight text-[#FFFFFF]">{s.label}</span>
              </div>
            );
          })}
        </nav>

        <footer className="mt-auto pt-8">
          {lastSaved && (
            <div className="mb-4 flex items-center gap-2 text-[#32D74B] text-[10px] font-bold uppercase tracking-widest opacity-60">
              <Save size={10} /> Saved {lastSaved.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
          )}
          <div className="flex items-center gap-2 text-xs text-[#32D74B] font-semibold mb-2">
            <div className="w-2 h-2 bg-[#32D74B] rounded-full shadow-[0_0_8px_rgba(50,215,75,0.4)]" />
            Synced to Sheets
          </div>
          <p className="text-[10px] text-[#8E8E93] font-medium tracking-wide">SkillsFix Student Records V2.4</p>
        </footer>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 bg-[#1C1C1E] p-16 sm:p-20 overflow-y-auto relative">
        {/* Animated Progress Bar */}
        <div className="absolute top-0 left-0 w-full h-1 bg-black/40 overflow-hidden z-50">
          <motion.div 
            className="h-full bg-gradient-to-r from-[#0A84FF] to-[#5856D6]"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.6, ease: "circOut" }}
          />
          {isLoading && (
            <motion.div 
              className="absolute top-0 left-0 h-full w-full bg-white/30"
              animate={{ x: ['-100%', '100%'] }}
              transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
            />
          )}
        </div>

        <div className="max-w-xl mx-auto h-full flex flex-col justify-center">
          <AnimatePresence mode="wait">
            {mode === 'login' && (
              <motion.div
                key="login-screen"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.02 }}
                className="space-y-8"
              >
                <div>
                  <h1 className="text-[32px] md:text-[40px] font-medium leading-[1.2] tracking-tight mb-4 text-white">
                    Member Access
                  </h1>
                  <p className="text-[#8E8E93] font-light">Enter your AIFIX credentials to continue your SkillsFix training.</p>
                </div>

                <form onSubmit={handleAuthAction} className="space-y-4 border-l-2 border-[#38383A] pl-8 py-2">
                  <div className="space-y-2">
                    <p className="text-[10px] uppercase tracking-widest font-bold text-[#8E8E93]">Email Address</p>
                    <input 
                      type="email" 
                      value={authEmail}
                      onChange={(e) => setAuthEmail(e.target.value)}
                      placeholder="name@company.com" 
                      className="w-full bg-transparent text-lg text-white outline-none border-b border-[#38383A] pb-2 focus:border-[#0A84FF] transition-colors" 
                    />
                  </div>
                  <div className="space-y-2">
                    <p className="text-[10px] uppercase tracking-widest font-bold text-[#8E8E93]">Password</p>
                    <input 
                      type="password" 
                      value={authPassword}
                      onChange={(e) => setAuthPassword(e.target.value)}
                      placeholder="••••••••" 
                      className="w-full bg-transparent text-lg text-white outline-none border-b border-[#38383A] pb-2 focus:border-[#0A84FF] transition-colors" 
                    />
                  </div>
                  <button 
                    type="button"
                    onClick={() => setMode('forgot_password')}
                    className="text-xs text-[#0A84FF] font-medium hover:underline flex items-center gap-1 focus:outline-none"
                  >
                    <Key size={12} /> Forgot your password?
                  </button>
                </form>

                <button 
                  type="submit"
                  onClick={handleAuthAction}
                  disabled={isLoading}
                  className="w-full bg-white text-black py-4 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-neutral-200 transition-all shadow-lg active:scale-[0.98] disabled:opacity-50"
                >
                  {isLoading ? <Loader2 className="animate-spin" size={18} /> : 'Login to Platform'}
                </button>
                
                {error && (
                  <div className="flex items-center justify-center gap-2 text-[#FF453A] text-xs font-semibold">
                    <AlertCircle size={14} /> {error}
                  </div>
                )}
                
                <button 
                  onClick={() => setMode('enrollment')}
                  className="w-full text-[#8E8E93] text-[10px] uppercase tracking-[0.2em] font-bold py-4 hover:text-white transition-colors focus:outline-none"
                >
                  Back to Enrollment Flow
                </button>
              </motion.div>
            )}

            {mode === 'forgot_password' && (
              <motion.div
                key="forgot-password-screen"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-8"
              >
                <div>
                  <button 
                    onClick={() => setMode('login')}
                    className="flex items-center gap-2 text-[#8E8E93] hover:text-white mb-8 transition-colors text-xs uppercase font-bold tracking-widest focus:outline-none"
                  >
                    <ChevronLeft size={16} /> Back to Login
                  </button>
                  <h1 className="text-[32px] md:text-[40px] font-medium leading-[1.2] tracking-tight mb-4 text-white">
                    Reset Password
                  </h1>
                  <p className="text-[#8E8E93] font-light">We'll send a secure reset link to the email registered with your AIFIX account.</p>
                </div>

                <form onSubmit={handleAuthAction} className="space-y-12">
                   <div className="relative group border-b-2 border-[#38383A] focus-within:border-[#0A84FF] focus-within:shadow-[0_4px_20px_rgba(10,132,255,0.1)] transition-all duration-300 pb-3">
                    <input
                      autoFocus
                      type="email"
                      value={authEmail}
                      onChange={(e) => setAuthEmail(e.target.value)}
                      placeholder="Account email..."
                      className="w-full bg-transparent text-2xl font-light text-white outline-none placeholder:text-[#48484A]"
                    />
                  </div>

                  <button 
                    type="submit"
                    disabled={!authEmail || isLoading}
                    className="w-full bg-[#0A84FF] text-white py-4 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-[#0071e3] transition-all shadow-lg active:scale-[0.98] disabled:opacity-50"
                  >
                    {isLoading ? <Loader2 className="animate-spin" size={18} /> : 'Send Reset Link'} <Mail size={18} />
                  </button>

                  {error && <p className="text-center text-[#32D74B] text-xs font-semibold">{error}</p>}
                </form>
              </motion.div>
            )}

            {mode === 'auth_loading' && (
              <motion.div
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col items-center gap-4"
              >
                <div className="w-8 h-8 border-2 border-[#0A84FF] border-t-transparent rounded-full animate-spin" />
                <p className="text-[#8E8E93] text-xs font-bold tracking-widest uppercase">Initialising Security...</p>
              </motion.div>
            )}

            {mode === 'admin' && (
              <motion.div
                key="admin-dashboard"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-12 w-full max-w-4xl"
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                  <div>
                    <h1 className="text-[32px] md:text-[40px] font-medium leading-[1.2] tracking-tight mb-2 text-white">
                      Enrollment Records
                    </h1>
                    <div className="flex items-center gap-3">
                      <p className="text-[#8E8E93] font-light">Administrative overview of all SkillsFix students on AIFIX.</p>
                      {isSyncActive && (
                        <span className="flex items-center gap-1.5 px-2 py-0.5 bg-[#32D74B]/20 text-[#32D74B] text-[9px] font-bold uppercase tracking-widest rounded-full border border-[#32D74B]/30 animate-pulse">
                          <Check size={8} strokeWidth={4} /> Auto-Sync Active
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <button 
                      onClick={handleExportToSheets}
                      disabled={isLoading}
                      className={`px-6 py-3 border rounded-xl text-xs font-bold uppercase tracking-widest transition-all flex items-center gap-2 group ${
                        isSyncActive 
                        ? 'bg-[#FF9500]/10 border-[#FF9500]/20 text-[#FF9500] hover:bg-[#FF9500]/20' 
                        : 'bg-[#32D74B]/10 border-[#32D74B]/20 text-[#32D74B] hover:bg-[#32D74B]/20'
                      }`}
                    >
                      {isLoading ? <Loader2 className="animate-spin" size={14} /> : <Table size={14} />} {isSyncActive ? 'Update Sync Target' : 'Enable Automated Sync'}
                    </button>
                    <button 
                      onClick={fetchAllEnrollments}
                      disabled={isLoading}
                      className="px-6 py-3 bg-white/5 border border-white/10 rounded-xl text-white text-xs font-bold uppercase tracking-widest hover:bg-white/10 transition-all flex items-center gap-2"
                    >
                      {isLoading ? <Loader2 className="animate-spin" size={14} /> : <Download size={14} />} Refresh Data
                    </button>
                    <button 
                      onClick={handleExportCSV}
                      disabled={enrollments.length === 0 || isLoading}
                      className="px-6 py-3 bg-white/5 border border-white/10 rounded-xl text-white text-xs font-bold uppercase tracking-widest hover:bg-white/10 transition-all flex items-center gap-2"
                    >
                      {isLoading ? <Loader2 className="animate-spin" size={14} /> : <Download size={14} />} Export CSV
                    </button>
                  </div>
                </div>

                <div className="relative group max-w-md">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-[#48484A] group-focus-within:text-[#0A84FF] transition-colors" size={18} />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search by name or email..."
                    className="w-full bg-[#000000] border border-[#38383A] rounded-xl py-3 pl-12 pr-4 text-sm text-white outline-none focus:border-[#0A84FF] focus:shadow-[0_0_20px_rgba(10,132,255,0.1)] transition-all"
                  />
                </div>

                <div className="grid grid-cols-1 gap-4">
                  {enrollments.filter(r => {
                    const search = searchTerm.toLowerCase();
                    const name = r.student_data?.full_name?.toLowerCase() || '';
                    const email = r.student_data?.email?.toLowerCase() || '';
                    return name.includes(search) || email.includes(search);
                  }).length === 0 && !isTyping && (
                    <div className="p-20 text-center border border-dashed border-[#38383A] rounded-3xl">
                      <p className="text-[#8E8E93] text-sm">No enrollment records match your search criteria.</p>
                    </div>
                  )}

                  {enrollments
                    .filter(r => {
                      const search = searchTerm.toLowerCase();
                      const name = r.student_data?.full_name?.toLowerCase() || '';
                      const email = r.student_data?.email?.toLowerCase() || '';
                      return name.includes(search) || email.includes(search);
                    })
                    .map((record) => (
                    <div key={record.id} className="p-6 bg-[#000000] border border-[#38383A] rounded-2xl space-y-6 group hover:border-[#0A84FF]/50 transition-colors">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <img 
                            src={record.student_data?.profile_picture || `https://api.dicebear.com/7.x/avataaars/svg?seed=${record.id}`} 
                            className="w-12 h-12 rounded-full border border-white/10"
                          />
                          <div>
                            <h3 className="text-lg font-medium text-white">{record.student_data?.full_name || 'Anonymous Student'}</h3>
                            <p className="text-xs text-[#8E8E93]">{record.student_data?.email}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest ${
                            record.current_step === Step.COMPLETED ? 'bg-[#32D74B]/20 text-[#32D74B]' : 'bg-[#FF9500]/20 text-[#FF9500]'
                          }`}>
                            {record.current_step === Step.COMPLETED ? 'Verified' : record.current_step}
                          </span>
                          <p className="text-[9px] text-[#48484A] mt-2 uppercase font-bold tracking-tighter">
                            {record.updatedAt?.toDate ? record.updatedAt.toDate().toLocaleString() : 'Recent Update'}
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t border-[#38383A]">
                        <div>
                          <p className="text-[9px] text-[#48484A] uppercase font-bold mb-1">Location</p>
                          <p className="text-xs text-white truncate">{record.student_data?.location_city}, {record.student_data?.location_country}</p>
                        </div>
                        <div>
                          <p className="text-[9px] text-[#48484A] uppercase font-bold mb-1">Experience</p>
                          <p className="text-xs text-white">Level {record.student_data?.coding_experience_level}</p>
                        </div>
                        <div>
                          <p className="text-[9px] text-[#48484A] uppercase font-bold mb-1">Goal</p>
                          <p className="text-xs text-white truncate">{record.student_data?.desired_outcome}</p>
                        </div>
                        <div className="flex justify-end items-center">
                           <button 
                            onClick={() => {
                              navigator.clipboard.writeText(JSON.stringify(record, null, 2));
                              setError("JSON copied to clipboard");
                              setTimeout(() => setError(null), 2000);
                            }}
                            className="p-2 hover:bg-white/5 rounded-lg text-white/40 hover:text-white transition-colors"
                           >
                            <Copy size={16} />
                           </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {mode === 'enrollment' && (
              <motion.div
                key={currentStep}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                className="w-full"
              >
              {currentStep !== Step.COMPLETED && (
                <p className="text-[#0A84FF] text-sm font-semibold mb-6 tracking-wide">
                  Step {currentIndex + 1} of {stepsList.length}
                </p>
              )}

              <h1 className="text-[32px] md:text-[40px] font-medium leading-[1.2] tracking-tight mb-8 text-white">
                {currentStep !== Step.COMPLETED && currentStep !== Step.CONFIRMATION ? getStepContent(currentStep) : "Welcome to the Program"}
              </h1>
              
              {(currentStep === Step.CONFIRMATION || currentStep === Step.COMPLETED) && (
                <div className="text-white/90">
                  {getStepContent(currentStep)}
                </div>
              )}

              {renderInputArea()}

              {isTyping && (
                <div className="mt-8 flex gap-1.5">
                  {[0, 1, 2].map((i) => (
                    <motion.div
                      key={i}
                      animate={{ opacity: [0.3, 1, 0.3] }}
                      transition={{ repeat: Infinity, duration: 1, delay: i * 0.2 }}
                      className="w-1.5 h-1.5 bg-[#38383A] rounded-full"
                    />
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </main>
  </div>
);
}

function getIconForStep(step: Step) {
  switch (step) {
    case Step.GREETING: return <MessageCircle size={14} />;
    case Step.NAME: return <User size={14} />;
    case Step.EMAIL: return <Mail size={14} />;
    case Step.IMAGE: return <Camera size={14} />;
    case Step.PHONE: return <Phone size={14} />;
    case Step.LOCATION: return <MapPin size={14} />;
    case Step.ROLE: return <Briefcase size={14} />;
    case Step.CODING: return <Code size={14} />;
    case Step.MOTIVATION: return <MessageCircle size={14} />;
    case Step.GOAL: return <Target size={14} />;
    case Step.REFERRAL: return <HelpCircle size={14} />;
    case Step.TOS: return <ShieldCheck size={14} />;
    case Step.VERIFICATION: return <Mail size={14} />;
    case Step.CONFIRMATION:
    case Step.COMPLETED: return <Check size={14} />;
    default: return null;
  }
}


