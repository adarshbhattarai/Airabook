import React from 'react';
import { motion } from 'framer-motion';
import { Heart, Star, Baby } from 'lucide-react';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';

const AiraHome = () => {
    const { user } = useAuth();
    const mediaLink = user ? "/media" : "/login";
    const notesLink = user ? "/notes" : "/login";

    return (
        <div className="min-h-screen">
            <Helmet>
                <title>Baby Aira - Our Little Angel's Journey</title>
                <meta name="description" content="Welcome to Baby Aira's world! Follow our precious little angel's journey through photos, videos, and heartwarming stories." />
            </Helmet>

            {/* Hero Section */}
            <section className="relative py-20 px-4 overflow-hidden">
                <div className="max-w-7xl mx-auto">
                    <div className="grid lg:grid-cols-2 gap-12 items-center">
                        <motion.div initial={{ opacity: 0, x: -50 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.8 }} className="text-center lg:text-left">
                            <h1 className="text-5xl lg:text-6xl font-bold mb-6">
                                <span className="bg-gradient-to-r from-purple-500 via-violet-500 to-indigo-500 bg-clip-text text-transparent">
                                    Meet Baby Aira
                                </span>
                            </h1>
                            <p className="text-xl text-gray-700 mb-8 leading-relaxed">
                                Our precious little angel, Aira, is the heart of our world, filling our days with endless joy, laughter, and love. With her arrival, we’ve embarked on the beautiful journey of parenthood, filled with surprises, countless firsts, and moments that make our hearts overflow as we cherish the gift of raising our very first child. Join us as we celebrate every milestone, every smile, and every magical moment of Aira’s journey, and the journey of us discovering parenthood for the very first time.
                            </p>
                            <div className="flex flex-wrap gap-4 justify-center lg:justify-start">
                                <div className="flex items-center space-x-2 bg-violet-100 px-4 py-2 rounded-full">
                                    <Heart className="h-5 w-5 text-violet-500 fill-current" />
                                    <span className="text-violet-700 font-medium">Born with Love</span>
                                </div>
                                <div className="flex items-center space-x-2 bg-indigo-100 px-4 py-2 rounded-full">
                                    <Star className="h-5 w-5 text-indigo-500 fill-current" />
                                    <span className="text-indigo-700 font-medium">Our Little Star</span>
                                </div>
                            </div>
                        </motion.div>

                        <motion.div initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.8, delay: 0.2 }} className="relative">
                            <div className="relative rounded-3xl overflow-hidden shadow-2xl bg-gradient-to-br from-violet-200 to-indigo-200 p-8">
                                <img className="w-full h-96 object-cover rounded-2xl shadow-lg" alt="Baby Aira smiling sweetly" src="https://horizons-cdn.hostinger.com/9f98afdb-ea6b-4dee-964a-89258405ca0c/img_8474-F1nlG.JPEG" />
                                <div className="absolute -top-4 -right-4 bg-yellow-300 rounded-full p-3 shadow-lg">
                                    <Baby className="h-8 w-8 text-yellow-700" />
                                </div>
                            </div>
                        </motion.div>
                    </div>
                </div>
            </section>

            {/* About Baby Aira */}
            <section className="py-20 px-4 bg-white/50">
                <div className="max-w-4xl mx-auto text-center">
                    <motion.div initial={{ opacity: 0, y: 50 }} whileInView={{ opacity: 1, y: 0 }} transition={{ duration: 0.8 }} viewport={{ once: true }}>
                        <h2 className="text-4xl font-bold mb-8 bg-gradient-to-r from-purple-500 to-indigo-500 bg-clip-text text-transparent">
                            About Our Little Angel
                        </h2>
                        <p className="text-lg text-gray-700 leading-relaxed mb-12">
                            Baby Aira is our bundle of joy who has transformed our world with her infectious giggles, curious eyes, and the sweetest little hands that reach for everything with wonder. Every day with her is a new adventure filled with precious moments we treasure forever.
                        </p>
                    </motion.div>
                </div>
            </section>

            {/* Parents Section */}
            <section className="py-20 px-4">
                <div className="max-w-6xl mx-auto">
                    <motion.div initial={{ opacity: 0, y: 50 }} whileInView={{ opacity: 1, y: 0 }} transition={{ duration: 0.8 }} viewport={{ once: true }} className="text-center mb-16">
                        <h2 className="text-4xl font-bold mb-4 bg-gradient-to-r from-purple-500 to-indigo-500 bg-clip-text text-transparent">
                            Meet Aira's Parents
                        </h2>
                        <p className="text-lg text-gray-700">
                            The loving family behind our little miracle
                        </p>
                    </motion.div>

                    <div className="grid md:grid-cols-2 gap-12">
                        <motion.div initial={{ opacity: 0, x: -50 }} whileInView={{ opacity: 1, x: 0 }} transition={{ duration: 0.8 }} viewport={{ once: true }} className="bg-white/70 backdrop-blur-sm rounded-3xl p-8 shadow-xl border border-violet-100">
                            <div className="text-center">
                                <img className="w-32 h-32 rounded-full mx-auto mb-6 object-cover shadow-lg border-4 border-violet-200" alt="Aira's mother smiling warmly" src="https://horizons-cdn.hostinger.com/9f98afdb-ea6b-4dee-964a-89258405ca0c/img_8253-JjTzj.JPEG" />
                                <h3 className="text-2xl font-bold text-gray-800 mb-2">Mommy</h3>
                                <p className="text-violet-600 font-medium mb-4">Aira's First Love</p>
                                <p className="text-gray-700 leading-relaxed">
                                    A new mom, completely in love with her little princess. She treasures every giggle, every milestone, and every tiny moment, filling each with patience, love, and joy. Every cry tugs at her heart, and she rushes to comfort her little one, holding her close as if to take away every worry. And with every smile, every sparkling laugh, and every tiny expression of happiness, her whole world brightens, filling her days with an overwhelming sense of wonder, love, and gratitude.
                                </p>
                            </div>
                        </motion.div>

                        <motion.div initial={{ opacity: 0, x: 50 }} whileInView={{ opacity: 1, x: 0 }} transition={{ duration: 0.8, delay: 0.2 }} viewport={{ once: true }} className="bg-white/70 backdrop-blur-sm rounded-3xl p-8 shadow-xl border border-indigo-100">
                            <div className="text-center">
                                <img className="w-32 h-32 rounded-full mx-auto mb-6 object-cover shadow-lg border-4 border-indigo-200" alt="Aira's father smiling proudly" src="https://horizons-cdn.hostinger.com/9f98afdb-ea6b-4dee-964a-89258405ca0c/img_9205-ZrG3l.jpeg" />
                                <h3 className="text-2xl font-bold text-gray-800 mb-2">Daddy</h3>
                                <p className="text-indigo-600 font-medium mb-4">Aira's Hero</p>
                                <p className="text-gray-700 leading-relaxed">
                                    A loving father who melts every time Baby Aira smiles at him. He's her protector, playmate, and the one who sings her to sleep every night.
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
                            Join Aira's Journey
                        </h2>
                        <p className="text-lg text-gray-700 mb-8">
                            Explore our gallery of precious memories and read the heartwarming stories of Baby Aira's adventures.
                        </p>
                        <div className="flex flex-wrap gap-4 justify-center">
                            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                                <Link to={mediaLink} className="inline-block bg-gradient-to-r from-purple-500 to-indigo-500 text-white px-8 py-3 rounded-full font-medium shadow-lg hover:shadow-xl transition-all duration-200">
                                    View Gallery
                                </Link>
                            </motion.div>
                            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                                <Link to={notesLink} className="inline-block bg-white text-indigo-600 px-8 py-3 rounded-full font-medium shadow-lg hover:shadow-xl border-2 border-indigo-200 hover:border-indigo-300 transition-all duration-200">
                                    Read Stories
                                </Link>
                            </motion.div>
                        </div>
                    </motion.div>
                </div>
            </section>
        </div>
    );
};

export default AiraHome;
