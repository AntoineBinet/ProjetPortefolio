/* Up Technologies — données fidèles à up-technologies.fr (audit du 4 mai 2026) */

export const UP_DATA = {
  contact: {
    email: 'contact@up-technologies.fr',
    tel: '+33 (0)4 78 94 28 97',
    telHref: 'tel:+33478942897',
    linkedin: 'https://www.linkedin.com/company/up-technologies/',
    linkedinJobs: 'https://www.linkedin.com/jobs/search/?currentJobId=4363665107&f_C=10790027&geoId=92000000&origin=COMPANY_PAGE_JOBS_CLUSTER_EXPANSION',
    siteOriginal: 'https://up-technologies.fr/',
    intranet: 'https://up-technologies.fr/intranet-up/',
  },

  rotatingWords: ['Expertise', 'Réactivité', 'Proximité', 'Flexibilité'],

  metiers: [
    {
      name: 'Informatique embarquée',
      icon: 'cpu',
      description: "Logiciel temps réel sur microcontrôleurs et microprocesseurs : firmware, drivers, couches d'abstraction, OS embarqués.",
      examples: ['Firmware C/C++ sur ARM Cortex', 'RTOS (FreeRTOS, Zephyr, AUTOSAR)', 'Bootloader & mises à jour OTA'],
    },
    {
      name: 'Électronique',
      icon: 'circuit',
      description: "Conception de cartes électroniques, du schéma au prototype industriel : analogique, numérique, puissance et RF.",
      examples: ['Schéma & routage PCB multi-couches', 'Cartes mixtes signal / puissance', 'Tests CEM et qualification'],
    },
    {
      name: 'Mécatronique / système',
      icon: 'gear',
      description: "Architecture de systèmes mêlant mécanique, électronique et logiciel — du besoin client à la qualification système.",
      examples: ['Ingénierie système (ISO 26262, ARP4754)', 'Spécifications & MBSE', 'V&V multi-domaines'],
    },
    {
      name: 'Moteur',
      icon: 'engine',
      description: "Modélisation, calibration et essais moteur — thermique, hybride et électrique. Du banc d'essais à la simulation 1D.",
      examples: ['Calibration moteur thermique', 'Simulation 1D (GT-Power, AMESim)', 'Essais banc & roulage'],
    },
    {
      name: 'Contrôle commande',
      icon: 'sliders',
      description: "Lois de commande, automatique et asservissement temps réel pour systèmes industriels et embarqués critiques.",
      examples: ['Identification & MATLAB / Simulink', 'Asservissement multi-boucles', 'Génération de code embarqué'],
    },
    {
      name: 'Internet of Things',
      icon: 'wifi',
      description: "Objets connectés du capteur au cloud : protocoles radio, gateways, sécurité, plateformes de données.",
      examples: ['LoRaWAN, BLE, Wi-Fi, NB-IoT', 'Edge computing & gateways', 'Cybersécurité & OTA flotte'],
    },
    {
      name: 'Gestion et coordination de projet',
      icon: 'flag',
      description: "Pilotage technique et fonctionnel : planning, exigences, fournisseurs, qualité — V-cycle ou agile selon le secteur.",
      examples: ['Pilotage forfait / workpackage', 'Référents techniques transverses', 'Méthodes V-cycle & agile'],
    },
  ],

  secteurs: [
    { key: 'auto', label: 'Automobile', tagline: 'En route vers les véhicules autonomes' },
    { key: 'energie', label: 'Énergie', tagline: 'Au cœur des défis du mix énergétique et des smart grids' },
    { key: 'sante', label: 'Santé', tagline: 'Produits pharmaceutiques et matériels médicaux de demain' },
    { key: 'aero', label: 'Aéronautique', tagline: 'Repousser les limites technologiques' },
    { key: 'ferro', label: 'Ferroviaire', tagline: 'Toujours plus rapide, toujours plus flexible' },
  ],

  projetsTypes: [
    'Développement logiciel embarqué',
    'Conception de cartes électroniques',
    'Calibration & simulation moteur',
    'Validation et vérification (médical)',
    'Conception batterie hydrogène',
    'Conduite autonome',
    'Développement embarqué smart grid',
  ],

  agences: [
    { ville: 'Lyon',            adresse: '48 boulevard des Belges',                      cp: '69006',  pays: 'Lyon',            founded: 2015, lat: 45.7700, lng: 4.8528 },
    { ville: 'Paris',           adresse: '55 rue la Boétie',                             cp: '75008',  pays: 'Paris',           founded: 2016, lat: 48.8731, lng: 2.3142 },
    { ville: 'Grenoble',        adresse: '167 cours de la Libération et du Général de Gaulle', cp: '38000', pays: 'Grenoble', founded: 2023, lat: 45.1810, lng: 5.7140 },
    { ville: 'Aix-en-Provence', adresse: '46 cours Mirabeau',                            cp: '13100',  pays: 'Aix-en-Provence', founded: 2018, lat: 43.5263, lng: 5.4454 },
    { ville: 'Toulon',          adresse: '8 place Gustave Lambert',                      cp: '83000',  pays: 'Toulon',          founded: 2020, lat: 43.1242, lng: 5.9275 },
    { ville: 'Nice Sophia',     adresse: '230 route des Dolines — Flex-O',               cp: '06560',  pays: 'Valbonne',        founded: 2024, lat: 43.6170, lng: 7.0600 },
  ],

  /* Page d'accueil — section "Développement de systèmes complexes"
     Textes repris du site live (PDF §6.4). */
  whyUp: [
    {
      title: "Pourquoi créer une société de conseil en industrie ?",
      icon: 'help',
      text: "Up Technologies a l'expérience, bonne et mauvaise, des sociétés de conseil. Nous proposons une société qui correspond à un état d'esprit de travail dans l'air du temps — celle dans laquelle nous aurions nous-mêmes souhaité travailler en tant que consultants. Initiatives, idées et actions de nos consultants nourrissent le développement de l'entreprise en parallèle de leur mission.",
    },
    {
      title: 'Changement de génération',
      icon: 'compass',
      text: "Les profils qui évoluent en société de conseil sont généralement dans leur premier tiers de parcours professionnel. Up Technologies se construit en intégrant les nouveaux modes de travail collaboratifs et l'état d'esprit des nouvelles générations d'ingénieurs et de techniciens.",
    },
    {
      title: "La réactivité n'est plus une option",
      icon: 'clock',
      text: "Un besoin de consultant chez nos clients est toujours urgent. Notre fonctionnement repose sur une forte vitesse de décision et d'exécution. De la qualification technique du besoin au premier jour d'intervention, le temps de réponse est celui imposé par le client.",
    },
    {
      title: 'Développer le réseau de contacts',
      icon: 'network',
      text: "Pour proposer autant de missions que les sociétés de conseil les plus connues, il faut être intégré à un réseau dense — et le développer. Avec plus de 10 ans d'expérience, les managers d'Up Technologies maîtrisent les métiers et les enjeux des acteurs industriels majeurs.",
    },
    {
      title: 'Des projets de carrière tous différents',
      icon: 'flag',
      text: "La proximité avec chaque consultant permet d'anticiper et de mettre en place les actions de repositionnement sur une nouvelle mission. Un principe collaboratif manager / consultant qui ouvre un système méritocratique à chaque changement de mission.",
    },
  ],

  cards3: [
    { title: 'Nos Métiers', icon: 'cpu', items: [
      'Informatique embarquée',
      'Électronique',
      'Mécatronique / système',
      'Moteur',
      'Contrôle commande',
      'Internet of Things',
      'Gestion et coordination de projet',
    ]},
    { title: "Nos Secteurs d'activité", icon: 'sectors', items: [
      'Automobile & véhicules autonomes',
      'Énergie, smart grid & pile à combustible',
      'Santé & dispositifs médicaux',
      'Aéronautique',
      'Ferroviaire',
    ]},
    { title: 'Nos Projets Types', icon: 'project', items: [
      'Développement logiciel embarqué',
      'Conception de cartes électroniques',
      'Calibration & simulation moteur',
      'Validation & vérification médical',
      'Conception batterie hydrogène',
      'Conduite autonome',
      'Développement embarqué smart grid',
    ]},
  ],

  /* Bloc "Notre intervention" — page Activités (PDF §7.1) */
  intervention: [
    {
      icon: 'project',
      title: 'Mission en assistance technique',
      text: "Nous intervenons au sein des équipes de nos clients pour apporter un support à la conception et au développement de leurs produits — missions d'une durée moyenne de 18 mois.",
    },
    {
      icon: 'cpu',
      title: "Bureau d'études — forfait & workpackage",
      text: "Nous intervenons depuis notre bureau d'études pour livrer des produits et études à nos clients avec un engagement de résultat.",
    },
    {
      icon: 'sectors',
      title: 'Innovation',
      text: "Au sein de notre bureau en innovation, nous développons des produits innovants et accompagnons nos clients dans la réalisation de POC et de prototypage rapide.",
    },
  ],

  certifications: [
    { kind: 'ecovadis', name: 'EcoVadis Silver',     desc: 'Performance RSE — Top 15%',       year: '2025' },
    { kind: 'iso9001',  name: 'ISO 9001:2015',       desc: 'Management de la qualité',        year: '2024' },
    { kind: 'iso27001', name: 'ISO 27001',           desc: "Sécurité de l'information",       year: '2024' },
    { kind: 'cir',      name: 'Agrément CIR',        desc: "Crédit d'impôt recherche",        year: '2024' },
    { kind: 'tftp',     name: 'Time for the Planet', desc: 'Engagement climatique',           year: '2024' },
  ],

  documents: [
    { kind: 'qualite',     label: 'Politique Globale Qualité 2024–2025',          ref: 'UP-ISO-5.2 V08',
      url: 'https://up-technologies.fr/wp-content/uploads/2025/08/UP-ISO-5.2-Politique-Globale-Qualite-2024-2025-V08.pdf' },
    { kind: 'gouvernance', label: "Code de conduite et d'éthique",                ref: 'Gouvernance',
      url: 'https://up-technologies.fr/wp-content/uploads/2024/05/Code-de-conduite-et-dethique-1.pdf' },
    { kind: 'gouvernance', label: 'Safety & Wellness Policy',                     ref: 'Gouvernance',
      url: 'https://up-technologies.fr/wp-content/uploads/2024/05/Safety-and-wellness-Policy.pdf' },
    { kind: 'gouvernance', label: 'Politique de diversité et inclusion',          ref: 'Gouvernance',
      url: 'https://up-technologies.fr/wp-content/uploads/2024/05/Politique-de-diversite-et-inclusion.pdf' },
    { kind: 'gouvernance', label: 'Environmental Policy',                         ref: 'Gouvernance',
      url: 'https://up-technologies.fr/wp-content/uploads/2024/05/Environmental-Policy.pdf' },
    { kind: 'rgpd',        label: 'Charte RGPD Up Technologies',                  ref: 'RGPD',
      url: 'https://up-technologies.fr/wp-content/uploads/2024/05/Charte-RGPD-Up-Technologies.pdf' },
  ],

  /* Page Activités — sectors with products & activities (PDF §7.3) */
  sectorContent: {
    auto: {
      kpi: '18',
      kpiLabel: 'mois · durée moyenne mission',
      products: ['Direction assistée', 'Moteur & chaîne cinématique', 'Châssis & suspensions', 'Réseaux électriques, électronique, HMI', 'Carrosserie'],
      activities: ['Management de projet', "Architecture du véhicule", "Ingénierie système & paramétrage", 'Conception mécanique / cotation', 'Logiciels embarqués & tests', 'Calculs & simulations', 'Essais véhicule'],
    },
    energie: {
      kpi: 'OT',
      kpiLabel: 'cybersécurité · smart grid',
      products: ['Groupes turbo-alternateur', 'Transformateurs de puissance', 'Disjoncteurs', 'Protections électriques', 'Réseaux transport & distribution'],
      activities: ['Analyse fonctionnelle', 'Études électrotechniques', "Dimensionnement & spécification d'équipements", 'Sûreté de fonctionnement', 'Mise en service & maintenance'],
    },
    sante: {
      kpi: 'IEC',
      kpiLabel: '62304 · 60601 · ISO 13485',
      products: ['Vaccins & biotechnologies', 'Pharma / cosmétiques / agroalimentaire', "Systèmes d'injection & dispositifs médicaux", 'Administration de médicaments', 'Diagnostic in vitro', 'Implants & prothèses', 'Perfusion / transfusion'],
      activities: ['Industrialisation procédés (scale-up)', 'Pièces plastiques & outillages', 'Logiciels embarqués & tests', 'Support assurance qualité', 'Qualification / Validation'],
    },
    aero: {
      kpi: 'DO-178C',
      kpiLabel: 'logiciel embarqué · DO-254',
      products: ["Système d'inertage", 'Distribution carburant', 'Nacelle de ravitaillement en vol', 'Systèmes de commandes (palonniers, volets, gouvernes)'],
      activities: ['Développement de logiciels embarqués', "Conception & intégration d'équipements", "Validation aérostructure (métal, composite, calculs, cinématique)", 'Support fonctionnel projet'],
    },
    ferro: {
      kpi: '∞',
      kpiLabel: 'plus rapide · plus flexible',
      products: ['Systèmes embarqués', 'Système de freinage', 'Signalisation', 'Télémaintenance', 'Pièces détachées & rechange'],
      activities: ['Implantation des systèmes', 'Ingénierie produit', "Dimensionnement d'équipements", 'Optimisation des flux pièces de rechange'],
    },
  },

  /* Page Carrière — repris du site live (PDF §8) */
  carriere: {
    pourquoi: {
      kicker: 'To start Up…',
      title: 'Pourquoi Up ?',
      points: [
        'Une société jeune et dynamique',
        'Un ancrage local et un réseau important',
        "Des missions pérennes qui te correspondent et t'intéressent vraiment",
      ],
    },
    metier: {
      kicker: "Un métier passionnant, de nombreux défis t'attendent…",
      title: 'Le métier de consultant',
      intro: "Le consultant a avant tout un rôle de conseil. Il intervient auprès des entreprises pour leur apporter un regard extérieur et une expertise sur des problèmes complexes.",
      avantages: [
        { title: 'Des missions variées', text: "Sur des missions de 6 à 18 mois, le consultant est rapidement confronté à des problématiques différentes auprès de multiples clients." },
        { title: 'Un enrichissement personnel', text: 'Diversité des métiers, personnalités et cultures côtoyés. Apprentissage constant.' },
        { title: 'De nombreux contacts', text: 'Le métier expose naturellement à un réseau professionnel dense.' },
      ],
      contreparties: [
        { title: 'Flexibilité', text: "S'adapter rapidement à un nouvel environnement de travail." },
        { title: 'Disponibilité', text: "L'emploi du temps du consultant est rythmé par le besoin du client." },
        { title: 'Confidentialité', text: 'Garantir la confidentialité des informations auxquelles il a accès.' },
      ],
    },
    rejoindre: {
      kicker: "Parce que notre but est aussi de t'aider dans ton parcours",
      title: 'Conseils pour nous rejoindre',
      intro: 'Notre 1er conseil concerne la définition de ton projet professionnel. Tout commence là.',
      questions: [
        "Quelle est ta formation, et qu'est-ce qui a motivé ce choix ?",
        'Que retires-tu de tes expériences professionnelles ?',
        'Quels sont tes points forts ?',
        'Tes traits de personnalité sont-ils compatibles avec le métier de consultant ?',
        "Qu'est-ce qui est important pour toi : un secteur, une discipline ?",
        'Quelle est ta mobilité géographique ?',
      ],
    },
  },

  /* Articles — repris de up-technologies.fr/actualites (PDF §10) */
  actualites: [
    {
      slug: 'medaille-argent-ecovadis',
      date: '17 décembre 2025',
      tag: 'Certification',
      cover: 'medaille',
      title: "Une médaille d'argent EcoVadis",
      excerpt: "En fin 2025, Up Technologies franchit une nouvelle étape : l'obtention de la médaille d'argent EcoVadis (Top 15%).",
    },
    {
      slug: 'electronique-au-coeur',
      date: '29 mars 2025',
      tag: 'Technique',
      cover: 'electronique',
      title: "L'électronique au cœur des équipes d'Up Technologies",
      excerpt: 'Chez Up Technologies, les équipes internes sont quotidiennement immergées dans des projets électroniques de pointe.',
    },
    {
      slug: 'defi-power-up',
      date: '20 février 2025',
      tag: 'Technique',
      cover: 'defi',
      title: 'Un défi pour Power Up',
      excerpt: "La testabilité des cartes électroniques est devenue l'un des enjeux majeurs — voici comment Power Up y répond.",
    },
    {
      slug: '2-fois-plus-certifie',
      date: '14 février 2025',
      tag: 'Certification',
      cover: 'certif2x',
      title: '2 fois plus certifié',
      excerpt: 'Up Technologies a franchi une nouvelle étape en obtenant deux certifications complémentaires.',
    },
    {
      slug: 'objectifs-environnementaux',
      date: '5 février 2025',
      tag: 'RSE',
      cover: 'env',
      title: "Les objectifs environnementaux d'Up Technologies",
      excerpt: 'Up Technologies est engagée dans une démarche environnementale ambitieuse pour 2030.',
    },
    {
      slug: 'agence-nice-sophia',
      date: '15 avril 2024',
      tag: 'Agence',
      cover: 'sophia',
      title: 'Nouvelle agence Up Technologies : Nice Sophia',
      excerpt: "Up Technologies s'agrandit ! Nous sommes désormais présents sur Sophia Antipolis.",
    },
    {
      slug: 'soiree-noel-2023',
      date: '8 janvier 2024',
      tag: 'Événement',
      cover: 'noel',
      title: 'Soirée de Noël 2023',
      excerpt: "Vendredi dernier, l'ensemble des équipes s'est retrouvé pour une soirée mémorable.",
    },
    {
      slug: 'inauguration-grenoble',
      date: '31 octobre 2023',
      tag: 'Agence',
      cover: 'grenoble',
      title: "Inauguration de l'agence de Grenoble",
      excerpt: "En octobre 2023, nouveaux locaux pour l'équipe grenobloise — un cadre repensé pour mieux collaborer.",
    },
    {
      slug: 'power-up-sido',
      date: '30 septembre 2023',
      tag: 'Événement',
      cover: 'sido',
      title: 'Power Up au SIDO !',
      excerpt: "Le Salon de l'Internet des Objets, 9ᵉ édition — Power Up y présente ses dernières réalisations.",
    },
    {
      slug: 'power-up-sagrandit',
      date: '31 décembre 2022',
      tag: 'Équipe',
      cover: 'powerup',
      title: "Notre Bureau d'Études Power Up s'agrandit",
      excerpt: "Power Up, nouvelle recrue ! Toute l'équipe de notre bureau d'études se renforce.",
    },
  ],
};
