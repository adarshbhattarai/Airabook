import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Heart, Star, Baby, Send, Sparkles } from 'lucide-react';
import { Helmet } from 'react-helmet';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';

const Home = () => {
  const { user } = useAuth();
  const mediaLink = user ? "/media" : "/login";
  const notesLink = user ? "/notes" : "/login";

  const navigate = useNavigate();
  const [typingText, setTypingText] = useState('');
  const [prompt, setPrompt] = useState('');
  const [phraseIndex, setPhraseIndex] = useState(0);
  const [charIndex, setCharIndex] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);

  const phrases = [
    "Write a book",
    "Write your journal",
    "Write baby journal",
    "Air your book",
    "Air a book"
  ];

  useEffect(() => {
    const currentPhrase = phrases[phraseIndex];
    const typeSpeed = isDeleting ? 30 : 60;

    const timeout = setTimeout(() => {
      if (!isDeleting && charIndex < currentPhrase.length) {
        setTypingText(currentPhrase.substring(0, charIndex + 1));
        setCharIndex(prev => prev + 1);
      } else if (isDeleting && charIndex > 0) {
        setTypingText(currentPhrase.substring(0, charIndex - 1));
        setCharIndex(prev => prev - 1);
      } else if (!isDeleting && charIndex === currentPhrase.length) {
        setTimeout(() => setIsDeleting(true), 2000);
      } else if (isDeleting && charIndex === 0) {
        setIsDeleting(false);
        setPhraseIndex((prev) => (prev + 1) % phrases.length);
      }
    }, typeSpeed);

    return () => clearTimeout(timeout);
  }, [charIndex, isDeleting, phraseIndex]);

  const handleInteraction = () => {
    if (user) {
      navigate('/dashboard', { state: { prompt } });
    } else {
      navigate('/login');
    }
  };

  return (
    <div className="min-h-screen">
      <Helmet>
        <title>Airabook - Write your story</title>
        <meta name="description" content="Create books, journals, and more with AI assistance." />
      </Helmet>

      {/* Matrix Chat Hero Section - Light Mode */}
      <section className="relative py-20 px-4 overflow-hidden bg-white min-h-[70vh] flex flex-col justify-center items-center">
        <div className="w-full max-w-6xl mx-auto z-10">
          <div className="grid lg:grid-cols-2 gap-12 items-center">

            {/* Left Column: Chat Interface */}
            <div className="space-y-12 text-center lg:text-left">
              {/* Animated Header */}
              <div className="min-h-[120px] flex flex-col items-center lg:items-start justify-center space-y-4">
                <h1 className="text-4xl md:text-6xl font-bold text-gray-900 tracking-tight">
                  {typingText}
                  <span className="animate-pulse text-app-iris">|</span>
                </h1>
                <h2 className="text-3xl md:text-5xl font-semibold text-gray-500">
                  with Airäbook
                </h2>
              </div>

              {/* Chat Input Replica */}
              <div className="w-full max-w-xl mx-auto lg:mx-0 relative group">
                <div className="absolute -inset-1 bg-gradient-to-r from-app-iris via-app-violet to-app-mint rounded-2xl opacity-20 group-hover:opacity-40 transition duration-500 blur-lg"></div>
                <div className="relative bg-white border border-gray-100 rounded-2xl shadow-2xl overflow-hidden">
                  <div className="flex flex-col">
                    <textarea
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      placeholder="Describe your book idea..."
                      className="w-full p-6 text-lg bg-transparent border-none focus:ring-0 resize-none text-gray-900 placeholder:text-gray-400 focus:outline-none min-h-[120px]"
                    />

                    <div className="flex items-center justify-between px-4 py-3 bg-gray-50/50 border-t border-gray-100">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            if (user) {
                              navigate('/dashboard', { state: { prompt: "Surprise me" } });
                            } else {
                              navigate('/login');
                            }
                          }}
                          className="flex items-center text-gray-500 text-sm px-3 py-1.5 rounded-full hover:bg-gray-100 transition-colors"
                        >
                          <Sparkles className="h-4 w-4 mr-2" />
                          Surprise me
                        </button>
                      </div>

                      <button
                        onClick={handleInteraction}
                        className="flex items-center gap-2 text-app-iris font-semibold hover:text-app-iris-hover transition-colors active:scale-95"
                      >
                        <span>Send</span>
                        <Send className="h-5 w-5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column: Mock Book Card */}
            <div className="flex justify-center lg:justify-end">
              <div className="w-full max-w-sm group relative bg-white/70 backdrop-blur rounded-2xl shadow-appSoft border border-white/50 p-4 transition-all duration-300 hover:shadow-appCard hover:-translate-y-1 overflow-hidden">

                {/* Gradient background layers */}
                <div className="absolute inset-0 opacity-40 group-hover:opacity-60 transition-opacity duration-500 pointer-events-none">
                  <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-purple-200 via-pink-200 to-transparent rounded-full blur-3xl transform translate-x-10 -translate-y-10" />
                  <div className="absolute bottom-0 left-0 w-64 h-64 bg-gradient-to-tr from-blue-200 via-violet-200 to-transparent rounded-full blur-3xl transform -translate-x-10 translate-y-10" />
                </div>

                {/* Content layer */}
                <div className="relative z-10 flex flex-col h-full">

                  {/* Header: Title */}
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-8 w-8 shrink-0 rounded-xl bg-app-mint text-app-navy flex items-center justify-center text-sm font-semibold shadow-sm">
                        M
                      </div>
                      <div className="flex flex-col min-w-0">
                        <h3 className="text-sm font-semibold text-app-gray-900 truncate pr-2">
                          My Daughter's Journal
                        </h3>
                        <span className="text-[10px] text-app-gray-500">
                          Airäbook
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Cover Image Area */}
                  <div className="block flex-1 relative group/image">
                    <div className="aspect-[3/4] w-full rounded-xl bg-gradient-to-br from-purple-50 via-white to-blue-50 border border-white/60 shadow-inner overflow-hidden relative">
                      <img
                        src="https://horizons-cdn.hostinger.com/9f98afdb-ea6b-4dee-964a-89258405ca0c/img_8474-F1nlG.JPEG"
                        alt="My Daughter's Journal"
                        className="w-full h-full object-cover transition-transform duration-500 group-hover/image:scale-105"
                      />

                      {/* Hover Overlay */}
                      <div className="absolute inset-0 bg-black/0 group-hover/image:bg-black/10 transition-colors duration-300 flex items-center justify-center opacity-0 group-hover/image:opacity-100">
                        <div className="bg-white/90 backdrop-blur px-3 py-1.5 rounded-full shadow-sm text-xs font-medium text-app-gray-900 transform translate-y-2 group-hover/image:translate-y-0 transition-transform duration-300">
                          Preview
                        </div>
                      </div>
                    </div>
                  </div>

                </div>
              </div>
            </div>

          </div>
        </div>

        {/* Background Elements */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_50%_50%,rgba(99,91,255,0.05),transparent_50%)]"></div>
        </div>
      </section>

      {/* App Narrative Section */}
      <section className="py-20 px-4 bg-white/50">
        <div className="max-w-4xl mx-auto text-center">
          <motion.div initial={{ opacity: 0, y: 50 }} whileInView={{ opacity: 1, y: 0 }} transition={{ duration: 0.8 }} viewport={{ once: true }}>
            <h2 className="text-4xl font-bold mb-8 bg-gradient-to-r from-purple-500 to-indigo-500 bg-clip-text text-transparent">
              A Timeless Gift for Your Child
            </h2>
            <p className="text-lg text-gray-700 leading-relaxed mb-12 italic">
              "My dearest child, as I watch you grow, I realize that these moments are fleeting treasures. I am writing this journal to capture the magic of our journey together, the laughter, the firsts, and the quiet joy of simply being with you. This book is more than just words; it is a legacy of love, a gift I am crafting for you to hold close when you are older. Let us preserve these memories today, so they may light up your tomorrow."
            </p>

            <div className="mt-16 text-left bg-gradient-to-br from-violet-50 to-indigo-50 p-8 rounded-3xl border border-indigo-100 shadow-sm">
              <h3 className="text-2xl font-bold mb-4 text-app-gray-900">
                A Living, Breathing Smart Book
              </h3>
              <p className="text-lg text-gray-700 leading-relaxed">
                Airäbook transforms your writing into a <strong>Smart Book</strong>. It's not just for reading; it's for interacting. You can ask your book questions, and it will answer you naturally, pulling from the memories and knowledge you've shared.
              </p>
              <p className="text-lg text-gray-700 leading-relaxed mt-4">
                Whether you're a parent preserving family history or a student mastering a new subject, your book becomes an interactive companion—ready to teach, remind, and engage with you in a whole new way.
              </p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Words from the Authors */}
      <section className="py-20 px-4 bg-app-gray-50">
        <div className="max-w-6xl mx-auto">
          <motion.div initial={{ opacity: 0, y: 50 }} whileInView={{ opacity: 1, y: 0 }} transition={{ duration: 0.8 }} viewport={{ once: true }} className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4 bg-gradient-to-r from-purple-500 to-indigo-500 bg-clip-text text-transparent">
              Words from the Authors
            </h2>
            <p className="text-lg text-gray-700 max-w-2xl mx-auto">
              See how writing a book helped these parents capture their journey. Airabook isn't just for memories; it's a powerful tool to learn and master any subject by writing your own books.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 gap-12">
            {/* Mommy's Page */}
            <motion.div
              initial={{ opacity: 0, rotateY: -10 }}
              whileInView={{ opacity: 1, rotateY: 0 }}
              transition={{ duration: 0.8 }}
              viewport={{ once: true }}
              className="bg-white rounded-r-2xl rounded-l-sm p-8 shadow-2xl border-l-4 border-app-gray-200 relative overflow-hidden group"
            >
              <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-bl from-gray-100 to-transparent opacity-50 pointer-events-none"></div>
              <div className="flex flex-col items-center text-center">
                <img className="w-24 h-24 rounded-full mb-6 object-cover shadow-md border-2 border-violet-100" alt="Aira's mother" src="https://horizons-cdn.hostinger.com/9f98afdb-ea6b-4dee-964a-89258405ca0c/img_8253-JjTzj.JPEG" />
                <h3 className="text-xl font-serif font-bold text-gray-900 mb-2">Mommy's Note</h3>
                <p className="text-violet-600 text-sm font-medium mb-6 uppercase tracking-wider">The Author</p>
                <p className="text-gray-700 leading-relaxed font-serif text-lg italic">
                  "Writing this book was a journey of rediscovery. It allowed me to pause time and truly appreciate the fleeting moments of motherhood. Airabook made it effortless to turn my scattered thoughts and phone photos into a cohesive story that I can now hold in my hands. It's the most precious gift I could ever give to my daughter and to myself."
                </p>
              </div>
            </motion.div>

            {/* Daddy's Page */}
            <motion.div
              initial={{ opacity: 0, rotateY: 10 }}
              whileInView={{ opacity: 1, rotateY: 0 }}
              transition={{ duration: 0.8, delay: 0.2 }}
              viewport={{ once: true }}
              className="bg-white rounded-l-2xl rounded-r-sm p-8 shadow-2xl border-r-4 border-app-gray-200 relative overflow-hidden group"
            >
              <div className="absolute top-0 left-0 w-16 h-16 bg-gradient-to-br from-gray-100 to-transparent opacity-50 pointer-events-none"></div>
              <div className="flex flex-col items-center text-center">
                <img className="w-24 h-24 rounded-full mb-6 object-cover shadow-md border-2 border-indigo-100" alt="Aira's father" src="https://horizons-cdn.hostinger.com/9f98afdb-ea6b-4dee-964a-89258405ca0c/img_9205-ZrG3l.jpeg" />
                <h3 className="text-xl font-serif font-bold text-gray-900 mb-2">Daddy's Dedication</h3>
                <p className="text-indigo-600 text-sm font-medium mb-6 uppercase tracking-wider">The Co-Author</p>
                <p className="text-gray-700 leading-relaxed font-serif text-lg italic">
                  "I wanted to leave something behind for Aira, something more than just digital files. Writing this book helped me articulate feelings I didn't know how to express. It's amazing how the act of writing helps you understand your own experiences better. Whether it's a journal or a guide on a complex topic, this platform makes the process incredibly rewarding."
                </p>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Donation Plans */}
      <section className="py-20 px-4 bg-[#ecf0f1]">
        <div className="max-w-6xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <p className="text-sm uppercase tracking-[0.4em] text-[#3498db]">Support the mission</p>
            <h2 className="text-4xl font-bold text-gray-900 mb-4">Pick a plan that fits</h2>
            <p className="text-gray-600">
              Free readers keep the memories alive. Supporters keep the servers and AI online.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                title: 'Free Explorer',
                price: '$0',
                description: 'Perfect for getting started',
                features: [
                  '3 books, up to 150 pages total',
                  '50 MB of uploads (images, small videos)',
                  '~50 AI assists/mo (write, rewrite, study)',
                  'Chat with your book using RAG'
                ],
                accent: 'from-gray-100 to-gray-50',
                buttonText: 'Start Writing',
                link: '/login',
                active: true
              },
              {
                title: 'Pro Plan',
                price: 'Coming Soon',
                description: 'For individuals writing more books & using more AI',
                features: [
                  'Unlimited books & pages',
                  'Increased upload limits',
                  'Advanced AI models',
                  'Priority support'
                ],
                accent: 'from-[#3498db] to-[#2c82c9]',
                buttonText: 'Notify Me',
                active: false
              },
              {
                title: 'Enterprise Studio',
                price: 'Coming Soon',
                description: 'For schools and teams',
                features: [
                  'Team management',
                  'Dedicated support',
                  'Custom solutions',
                  'API access'
                ],
                accent: 'from-[#2ecc71] to-[#27ae60]',
                buttonText: 'Notify Me',
                active: false
              },
            ].map((plan) => (
              <motion.div
                key={plan.title}
                whileHover={plan.active ? { y: -6 } : {}}
                className={`bg-white rounded-3xl shadow-xl border border-white overflow-hidden flex flex-col ${!plan.active ? 'opacity-75 grayscale-[0.3]' : ''}`}
              >
                <div className={`h-2 bg-gradient-to-r ${plan.accent}`} />
                <div className="p-8 space-y-6 flex-1 flex flex-col">
                  <div>
                    <div className="flex justify-between items-start mb-2">
                      <h3 className="text-2xl font-semibold text-gray-900">{plan.title}</h3>
                      {!plan.active && (
                        <span className="bg-gray-100 text-gray-600 text-xs font-bold px-2 py-1 rounded-full uppercase tracking-wide">
                          Coming Soon
                        </span>
                      )}
                    </div>
                    <p className={`text-xl font-bold ${plan.active ? 'text-[#3498db]' : 'text-gray-500'}`}>{plan.price}</p>
                    <p className="text-gray-600 text-sm mt-2">{plan.description}</p>
                  </div>

                  <ul className="space-y-3 flex-1">
                    {plan.features?.map((feature, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                        <span className={`mt-1 h-1.5 w-1.5 rounded-full flex-shrink-0 ${plan.active ? 'bg-[#3498db]' : 'bg-gray-400'}`} />
                        {feature}
                      </li>
                    ))}
                  </ul>

                  <div className="pt-4">
                    {plan.active ? (
                      <Link
                        to={plan.link}
                        className="block w-full text-center bg-[#3498db] text-white px-6 py-3 rounded-xl font-medium shadow-md hover:bg-[#2c82c9] transition"
                      >
                        {plan.buttonText}
                      </Link>
                    ) : (
                      <button
                        disabled
                        className="block w-full text-center bg-gray-100 text-gray-400 px-6 py-3 rounded-xl font-medium cursor-not-allowed"
                      >
                        {plan.buttonText}
                      </button>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>


        </div>
      </section>

      {/* Call to Action */}
      <section className="py-20 px-4 bg-gradient-to-r from-violet-100 to-indigo-100">
        <div className="max-w-4xl mx-auto text-center">
          <motion.div initial={{ opacity: 0, y: 50 }} whileInView={{ opacity: 1, y: 0 }} transition={{ duration: 0.8 }} viewport={{ once: true }}>
            <h2 className="text-4xl font-bold mb-6 bg-gradient-to-r from-purple-500 to-indigo-500 bg-clip-text text-transparent">
              Try it out today
            </h2>
            <p className="text-lg text-gray-700 mb-8">
              It's free to use and see what the platform can do.
            </p>
            <div className="flex flex-wrap gap-4 justify-center">
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                <Link to="/login" className="inline-block bg-gradient-to-r from-purple-500 to-indigo-500 text-white px-8 py-3 rounded-full font-medium shadow-lg hover:shadow-xl transition-all duration-200">
                  Start Writing Now
                </Link>
              </motion.div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 text-center text-gray-500 text-sm bg-white border-t border-gray-100">
        <p>&copy; Airabook 2025</p>
      </footer>
    </div>
  );
};

export default Home;
