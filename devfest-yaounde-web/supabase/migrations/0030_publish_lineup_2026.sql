/*
 * Publish the DevFest Yaoundé 2026 lineup: 24 speakers and their 24 sessions
 * (ADR 0073), from the Sessionize "accepted sessions" export of 2026-11-15.
 *
 * WHY A MIGRATION AND NOT JUST THE JSON. The live `editorial_documents` row
 * for `speakers` exists and holds an EMPTY array (checked read-only on
 * 2026-11-15). A row always wins over `src/data/speakers.json`, so deploying
 * the JSON alone would publish nothing. There is no `sessions` row, so that
 * collection would go live from the JSON on deploy anyway; it is written here
 * too so both land in the same moment and stay editable from the dashboard.
 *
 * PUBLIC FIELDS ONLY. Names, roles, bios, icebreakers, profile links and the
 * talks. No phone numbers, emails, residence, T-shirt sizes or Sessionize
 * owner timestamps — those columns of the export were never read into this.
 *
 * SAFETY, NOT SILENCE: if either row already holds records — an organiser
 * started entering speakers by hand after this was written — this stops
 * rather than overwriting their work, and names how many it found. Both
 * current payloads are snapshotted into `editorial_migration_backup` first.
 *
 * DEPLOY ORDER: apply AFTER the code deploys. The new session fields
 * (`lightning`, `online`, `level`, `language`, `originalLanguage`, optional
 * `time`/`room`/`durationMin`) are only understood by the new code; the old
 * code's admin schema would refuse to re-save these rows.
 */
do $$
declare
  n int;
begin
  select coalesce(jsonb_array_length(payload), 0) into n
  from public.editorial_documents where id = 'speakers';
  if coalesce(n, 0) > 0 then
    raise exception
      'lineup 0030: the speakers row already holds % record(s). Not overwriting hand-entered speakers — merge by hand (see ADR 0073), then re-run.', n;
  end if;

  select coalesce(jsonb_array_length(payload), 0) into n
  from public.editorial_documents where id = 'sessions';
  if coalesce(n, 0) > 0 then
    raise exception
      'lineup 0030: the sessions row already holds % record(s). Not overwriting hand-entered sessions — merge by hand (see ADR 0073), then re-run.', n;
  end if;
end $$;

insert into public.editorial_migration_backup (migration, document_id, payload)
select '0030', d.id, d.payload
from public.editorial_documents d
where d.id in ('speakers', 'sessions')
on conflict (migration, document_id) do nothing;

insert into public.editorial_documents (id, payload, updated_at, updated_by)
values ('speakers', $lineup$[
  {
    "id": "cabrel-domfang",
    "name": "Cabrel Domfang",
    "role": {
      "fr": "Tech Evangelist",
      "en": "Tech Evangelist"
    },
    "company": "",
    "photoUrl": "/speakers/cabrel-domfang.webp",
    "bio": {
      "fr": "Je suis Cabrel DOMFANG, Tech Evangelist, Serial Event Organizer et Solution Provider, animé par l'innovation, le développement des communautés et l'impact social.\n\nTitulaire d'un diplôme en Génie Informatique, je pilote des initiatives technologiques d'envergure au Cameroun et en Afrique. En tant que leader communautaire, j'ai collaboré avec Women Techmakers, Google Developer Group (Organisateur), dotNet Cameroun (Organisateur), Encode AI (Regional Lead) et plusieurs réseaux tech africains pour aider les étudiants et professionnels à accéder à des opportunités, certifications et programmes de mentorat.\n\nAu-delà du leadership communautaire, j'interviens lors d'événements, j'accompagne des jeunes et je crée du contenu pour les guider vers des carrières tech épanouissantes en alliant technologie, créativité et sens.\n\nMa mission : Rendre la technologie accessible à tous et créer un impact positif durable.",
      "en": "I'm Cabrel DOMFANG, Tech Evangelist, Serial Event Organizer and Solution Provider, driven by innovation, community building and social impact.\n\nWith a degree in Computer Engineering, I lead large-scale tech initiatives in Cameroon and across Africa. As a community leader, I've worked with Women Techmakers, Google Developer Group (Organizer), dotNet Cameroon (Organizer), Encode AI (Regional Lead) and several African tech networks to help students and professionals access opportunities, certifications and mentorship programmes.\n\nBeyond community leadership, I speak at events, mentor young people and create content to guide them towards fulfilling tech careers that bring together technology, creativity and purpose.\n\nMy mission: make technology accessible to everyone and create a lasting positive impact."
    },
    "track": {
      "fr": "Web",
      "en": "Web"
    },
    "day": 1,
    "sessionIds": [
      "sz-1339016"
    ],
    "social": {
      "x": "https://x.com/CabrelLesage",
      "linkedin": "https://linkedin.com/in/cabrellesage"
    },
    "icebreakerQuestion": {
      "fr": "Quel est le meilleur conseil tech qu'on ne vous a jamais enseigné à l'école ?",
      "en": "What's the best tech advice school never taught you?"
    },
    "icebreakerAnswer": {
      "fr": "Savoir expliquer un problème technique à sa grand-mère vous rendra dix fois meilleur en architecture logicielle que n'importe quel livre.",
      "en": "Being able to explain a technical problem to your grandmother will make you ten times better at software architecture than any book."
    }
  },
  {
    "id": "egbe-michel",
    "name": "Egbe Michel",
    "role": {
      "fr": "Développeur frontend et créatif",
      "en": "Frontend Developer and Creative"
    },
    "company": "",
    "photoUrl": "/speakers/egbe-michel.webp",
    "bio": {
      "fr": "« Mich » est étudiant en génie logiciel et développeur frontend : il aime transformer des idées complexes en expériences concrètes et soignées, avec les outils d'un créatif.",
      "en": "“Mich” is a Software Engineering student and frontend developer who enjoys turning complex ideas into practical, polished experiences with the tools of a creative."
    },
    "track": {
      "fr": "Cloud",
      "en": "Cloud"
    },
    "day": 1,
    "sessionIds": [
      "sz-1350359"
    ],
    "social": {
      "x": "https://x.com/egbemichel7678",
      "linkedin": "https://www.linkedin.com/in/egbe-michel-40863a299",
      "website": "https://egbemichel.tech"
    },
    "icebreakerQuestion": {
      "fr": "Si ton IA vient d'écrire ton code, qui vérifie qu'il est sûr de le mettre en production ?",
      "en": "If your AI just wrote your code, who’s checking that it’s safe to ship?"
    },
    "icebreakerAnswer": {
      "fr": "Honnêtement, la plupart d'entre nous font juste git push en croisant les doigts. Mais que se passe-t-il vraiment ensuite ? Où va le code, quels contrôles passe-t-il, et comment arrive-t-il finalement en production ? C'est ce qu'on va explorer.",
      "en": "Honestly, most of us just hit git push and hope for the best. But what actually happens after that? Where does the code go, what checks does it pass, and how does it eventually make its way to production? That’s what we’re going to explore."
    }
  },
  {
    "id": "linda-ebete",
    "name": "Linda Ebete",
    "role": {
      "fr": "Ingénieure cybersécurité",
      "en": "Cybersecurity Engineer"
    },
    "company": "",
    "photoUrl": "/speakers/linda-ebete.webp",
    "bio": {
      "fr": "Ingénieure en sécurité, je m'intéresse à tout ce qui permet de concevoir des architectures robustes et de sécuriser les applications face aux menaces du terrain. J'aime creuser les sujets d'architecture, de gouvernance et de sécurité offensive, tout en partageant ma passion au sein de l'écosystème tech.",
      "en": "A security engineer, I'm interested in everything that goes into designing robust architectures and securing applications against real-world threats. I love digging into architecture, governance and offensive security, while sharing my passion within the tech ecosystem."
    },
    "track": {
      "fr": "Cybersécurité",
      "en": "Cybersecurity"
    },
    "day": 1,
    "sessionIds": [
      "sz-1350410"
    ],
    "social": {
      "linkedin": "https://www.linkedin.com/in/linda-ebete-7967492a2"
    },
    "icebreakerQuestion": {
      "fr": "—",
      "en": "—"
    },
    "icebreakerAnswer": {
      "fr": "—",
      "en": "—"
    }
  },
  {
    "id": "danwe-basga",
    "name": "Danwe Basga",
    "role": {
      "fr": "Co-fondateur et CEO",
      "en": "Co-founder & CEO"
    },
    "company": "HoroHouse",
    "photoUrl": "/speakers/danwe-basga.webp",
    "bio": {
      "fr": "Ingénieur logiciel camerounais et entrepreneur, je suis co-fondateur et CEO de HoroHouse, une startup proptech qui conçoit des solutions numériques pour rendre l'immobilier plus accessible, plus sûr et plus intelligent en Afrique.\n\nFort d'une formation en génie logiciel, je travaille sur le développement web et mobile, les systèmes backend, le cloud et les applications propulsées par l'IA. À travers mes projets et mon parcours de startup, je m'intéresse particulièrement à l'usage de la technologie pour résoudre des problèmes concrets dans des contextes africains.\n\nJe suis passionné par le génie logiciel, l'intelligence artificielle, l'entrepreneuriat et le partage de connaissances pratiques avec la communauté des développeurs.",
      "en": "I am a Cameroonian software engineer, entrepreneur, and Co-founder & CEO of HoroHouse, a proptech startup building digital solutions to make real estate more accessible, secure, and intelligent in Africa.\n\nWith a background in software engineering, I work across web and mobile development, backend systems, cloud technologies, and AI-powered applications. Through my projects and startup journey, I am particularly interested in using technology to solve real-world problems in African contexts.\n\nI am passionate about software engineering, artificial intelligence, entrepreneurship, and sharing practical knowledge with the developer community."
    },
    "track": {
      "fr": "IA & ML",
      "en": "AI & ML"
    },
    "day": 1,
    "sessionIds": [
      "sz-1351469"
    ],
    "social": {
      "linkedin": "https://www.linkedin.com/in/danwe-basga-a4426626b",
      "website": "https://www.horohouse.com"
    },
    "icebreakerQuestion": {
      "fr": "Quelle est la chose que l'IA ne remplacera jamais chez un excellent développeur ?",
      "en": "What's one thing AI will never replace in a great developer?"
    },
    "icebreakerAnswer": {
      "fr": "La capacité à comprendre le problème avant d'écrire le code.",
      "en": "The ability to understand the problem before writing the code."
    }
  },
  {
    "id": "rostand-tchuekam",
    "name": "Rostand Tchuekam",
    "role": {
      "fr": "Fondateur et AI Product Builder · Créateur de TchueKAM Agent",
      "en": "Founder & AI Product Builder · Creator of TchueKAM Agent"
    },
    "company": "GianTecH Empire",
    "photoUrl": "/speakers/rostand-tchuekam.webp",
    "bio": {
      "fr": "Rostand Tchuekam est un fondateur tech camerounais qui conçoit des produits d'IA, avec un objectif : bâtir une infrastructure numérique concrète pour l'Afrique. Il est le fondateur de GianTecH Empire et le créateur de TchueKAM, un produit d'IA dédié au travail numérique autonome.\n\nSon travail couvre les agents IA, l'automatisation, le commerce numérique, le développement web et applicatif, et des outils pensés autour des réalités des entreprises et des utilisateurs africains.\n\nRostand s'intéresse particulièrement à transformer les nouvelles capacités de l'IA en vrais produits qui résolvent des problèmes opérationnels et économiques, plutôt qu'en simples démonstrations technologiques.",
      "en": "Rostand Tchuekam is a Cameroonian technology founder and AI product builder focused on building practical digital infrastructure for Africa. He is the founder of GianTecH Empire and creator of TchueKAM, an AI product focused on autonomous digital work.\n\nHis work spans AI agents, automation, digital commerce, web and application development, and tools designed around the realities of African businesses and users.\n\nRostand is particularly interested in turning emerging AI capabilities into real products that solve operational and economic problems rather than simply demonstrating the technology."
    },
    "track": {
      "fr": "IA & ML",
      "en": "AI & ML"
    },
    "day": 1,
    "sessionIds": [
      "sz-1352359"
    ],
    "social": {
      "linkedin": "https://www.linkedin.com/in/tchuekam-rostand/",
      "website": "https://tchuekam.com"
    },
    "icebreakerQuestion": {
      "fr": "Quelle est la chose la plus ambitieuse que tu aies construite avec l'IA ?",
      "en": "What's the most ambitious thing you've built with AI?"
    },
    "icebreakerAnswer": {
      "fr": "Un espace de travail numérique propulsé par l'IA, conçu pour aller au-delà du chat et exécuter réellement le travail grâce à des outils, de l'automatisation et des intégrations.",
      "en": "An AI-powered digital workspace designed to move beyond chat and actually execute work through tools, automation, and integrations"
    }
  },
  {
    "id": "steve-kambea-ndjeumou",
    "name": "Steve Kambea Ndjeumou",
    "role": {
      "fr": "CEO",
      "en": "CEO"
    },
    "company": "Nova Cameroun",
    "photoUrl": "/speakers/steve-kambea-ndjeumou.webp",
    "bio": {
      "fr": "Kambea Ndjeumou Steve: Ingénieur en Télécommunications et CEO de l'agence digitale Nova Cameroun, possède une solide expérience dans la création d'architectures réseau et de logiciels que les gens utilisent vraiment. Fasciné par le point de friction entre l'ingénierie complexe et la réalité du terrain, il milite pour un développement pragmatique où l'ergonomie prime sur la sur-ingénierie. Aujourd’hui, il vient partager sa vision : pourquoi la meilleure architecture cloud du monde ne sert à rien si votre interface est plus lente qu'un stylo Bic.",
      "en": "Kambea Ndjeumou Steve, a telecommunications engineer and CEO of the digital agency Nova Cameroun, has solid experience building network architectures and software that people actually use. Fascinated by the friction point between complex engineering and the reality on the ground, he advocates for pragmatic development where usability beats over-engineering. Today he's here to share his view: why the best cloud architecture in the world is useless if your interface is slower than a Bic pen."
    },
    "track": {
      "fr": "Gestion de produit",
      "en": "Product Management"
    },
    "day": 1,
    "sessionIds": [
      "sz-1352668"
    ],
    "icebreakerQuestion": {
      "fr": "—",
      "en": "—"
    },
    "icebreakerAnswer": {
      "fr": "—",
      "en": "—"
    }
  },
  {
    "id": "samuel-de-essaka",
    "name": "Samuel De Essaka",
    "role": {
      "fr": "Ingénieur logiciel",
      "en": "Software Engineer"
    },
    "company": "",
    "photoUrl": "/speakers/samuel-de-essaka.webp",
    "bio": {
      "fr": "Ingénieur logiciel explorant les liens entre l'IA, l'éducation et l'apprentissage humain.\nJe m'intéresse tout particulièrement à la manière dont l'IA peut aider les gens à mieux apprendre, à améliorer leur productivité et à bénéficier d'expériences d'apprentissage plus personnalisées. À travers mon travail et mes projets, j'explore les moyens d'utiliser l'IA comme un outil au service de la compréhension, de la pratique et de la créativité, plutôt que comme un substitut à la pensée humaine.",
      "en": "A software engineer exploring the links between AI, education and human learning.\nI'm particularly interested in how AI can help people learn better, boost their productivity and benefit from more personalised learning experiences. Through my work and projects, I explore ways to use AI as a tool that serves understanding, practice and creativity, rather than as a substitute for human thinking."
    },
    "track": {
      "fr": "IA & ML",
      "en": "AI & ML"
    },
    "day": 1,
    "sessionIds": [
      "sz-1353400"
    ],
    "social": {
      "linkedin": "https://www.linkedin.com/in/samuel-henri-ellong-de-essaka-140a5b282"
    },
    "icebreakerQuestion": {
      "fr": "Quelle est la seule chose que l'IA ne devrait jamais faire pour un apprenant ?",
      "en": "What's the one thing AI should never do for a learner?"
    },
    "icebreakerAnswer": {
      "fr": "Réfléchir à leur place. L'IA devrait nous aider à comprendre, à remettre en question, à mettre en pratique et à apprendre plus vite — et non pas se substituer à la réflexion qui fait toute la valeur de l'apprentissage.",
      "en": "Think for them. AI should help us understand, question, practise and learn faster — not replace the thinking that gives learning all its value."
    }
  },
  {
    "id": "emerson-folong",
    "name": "Emerson Folong",
    "role": {
      "fr": "Développeur full-stack & DevOps",
      "en": "Full-stack Developer & DevOps"
    },
    "company": "",
    "photoUrl": "/speakers/emerson-folong.webp",
    "bio": {
      "fr": "Ingénieur logiciel cloud, ingénieur DevOps et passionné de tech. Je travaille à la croisée du développement logiciel, de l'infrastructure cloud et de l'automatisation, avec une expérience concrète de la conception, du déploiement et de la maintenance d'applications web et de services backend.\nJ'ai de l'expérience avec AWS, Docker, Jenkins, Terraform, la CI/CD, l'Infrastructure as Code et le développement backend avec Node.js, Python, Django et FastAPI.",
      "en": "Cloud Software Engineer, DevOps Engineer and tech enthusiast. I work at the intersection of software development, cloud infrastructure, and automation, with hands-on experience designing, deploying, and maintaining web applications and backend services.\nI have experience working with AWS, Docker, Jenkins, Terraform, CI/CD, Infrastructure as Code, and backend development with Node.js, Python, Django, and FastAPI."
    },
    "track": {
      "fr": "Cloud",
      "en": "Cloud"
    },
    "day": 1,
    "sessionIds": [
      "sz-1353994"
    ],
    "social": {
      "x": "https://x.com/folong201",
      "linkedin": "https://www.linkedin.com/in/folong201/",
      "website": "https://www.folong201.com"
    },
    "icebreakerQuestion": {
      "fr": "—",
      "en": "—"
    },
    "icebreakerAnswer": {
      "fr": "—",
      "en": "—"
    }
  },
  {
    "id": "manuel-karim-abolo",
    "name": "Manuel Karim Abolo",
    "role": {
      "fr": "Traducteur · Spécialiste en communication internationale · Explore l'IA, les langues et l'avenir du travail",
      "en": "Translator · International Communication Specialist · Exploring AI, Language & the Future of Work"
    },
    "company": "",
    "photoUrl": "/speakers/manuel-karim-abolo.webp",
    "bio": {
      "fr": "Je suis traducteur professionnel et spécialiste en communication internationale, avec une formation en relations internationales et en action publique. Je suis passionné par la rencontre entre le langage, l'intelligence artificielle et la transformation des métiers, en particulier dans le contexte africain. Mon travail explore la manière dont l'IA peut renforcer la traduction, la communication et l'employabilité, tout en contribuant à des écosystèmes numériques multilingues plus inclusifs.",
      "en": "I am a professional translator and international communication specialist with a background in International Relations and Public Action. I am passionate about the intersection of language, artificial intelligence and professional transformation, particularly in the African context. My work explores how AI can enhance translation, communication and employability while contributing to more inclusive multilingual digital ecosystems."
    },
    "track": {
      "fr": "IA & ML",
      "en": "AI & ML"
    },
    "day": 1,
    "sessionIds": [
      "sz-1354849"
    ],
    "social": {
      "linkedin": "https://www.linkedin.com/in/manuel-karim-abolo-b9a8731b4"
    },
    "icebreakerQuestion": {
      "fr": "—",
      "en": "—"
    },
    "icebreakerAnswer": {
      "fr": "—",
      "en": "—"
    }
  },
  {
    "id": "gervais-azanga-ayissi",
    "name": "Gervais Azanga Ayissi",
    "role": {
      "fr": "CEO et fondateur, designer et développeur full-stack",
      "en": "CEO & Founder, designer and full-stack developer"
    },
    "company": "Numerid.tech",
    "photoUrl": "/speakers/gervais-azanga-ayissi.webp",
    "bio": {
      "fr": "Gervais Azanga Ayissi est étudiant en informatique à l’Université de Yaoundé I et CEO & Fondateur de Numerid.tech, une structure qui conçoit des solutions numériques pensées pour le contexte africain. Parmi ses produits phares : NSCE (Numeric Student Card Environment), une plateforme de digitalisation des cartes étudiantes ; Gestock+, un système de gestion de stock et point de vente mobile pour les commerçants ; et Finder, une application aidant les étudiants à retrouver leurs documents perdus via un bureau de dépôt de confiance.",
      "en": "Gervais Azanga Ayissi is a computer science student at the University of Yaoundé I and CEO & Founder of Numerid.tech, a company building digital solutions designed for the African context. Its flagship products include NSCE (Numeric Student Card Environment), a platform that digitises student ID cards; Gestock+, a mobile stock-management and point-of-sale system for shopkeepers; and Finder, an app that helps students recover lost documents through a trusted drop-off office."
    },
    "track": {
      "fr": "IA & ML",
      "en": "AI & ML"
    },
    "day": 1,
    "sessionIds": [
      "sz-1355263"
    ],
    "social": {
      "x": "https://x.com/Azanga_gervais",
      "linkedin": "https://cm.linkedin.com/in/gervais-azanga-ayissi",
      "website": "https://gerazayis.finders.africa/"
    },
    "icebreakerQuestion": {
      "fr": "Tu as déjà demandé à une IA une référence bibliographique qui n’existait pas vraiment ?",
      "en": "Have you ever asked an AI for a bibliography reference that didn't actually exist?"
    },
    "icebreakerAnswer": {
      "fr": "Oui et j’ai failli la mettre dans un rapport. C’est ce jour-là que j’ai cherché mieux.",
      "en": "Yes — and I nearly put it in a report. That's the day I went looking for something better."
    }
  },
  {
    "id": "destin-kouam",
    "name": "Destin Kouam",
    "role": {
      "fr": "Fondateur et Creative Program Manager",
      "en": "Founder & Creative Program Manager"
    },
    "company": "Hakkilo XR",
    "photoUrl": "/speakers/destin-kouam.webp",
    "bio": {
      "fr": "Passionné de transformation digitale, je mets mon goût pour l'innovation au service de formations et de solutions qui répondent aux défis de l'Afrique grâce aux dernières technologies comme l'AR, la VR et l'IA.",
      "en": "Digital Transformation Enthusiast leveraging my passion for innovation to provide training and solutions for Africa's challenging problems using latest technologies like AR, VR, and AI."
    },
    "track": {
      "fr": "IA & ML",
      "en": "AI & ML"
    },
    "day": 1,
    "sessionIds": [
      "sz-1367658"
    ],
    "social": {
      "x": "https://x.com/De_MetapreNerd",
      "linkedin": "https://www.linkedin.com/in/sagedestin/",
      "website": "https://www.hakkiloxr.com"
    },
    "icebreakerQuestion": {
      "fr": "Si tu devais subir une opération chirurgicale complexe, choisirais-tu un chirurgien camerounais avec de nombreuses années d'expérience, ou un chirurgien fraîchement diplômé formé aux États-Unis ou en France ? Pourquoi ?",
      "en": "If you had to undergo a complex surgical procedure, would you choose a Cameroonian surgeon with many years of experience or a newly qualified surgeon trained in USA or France? Why?"
    },
    "icebreakerAnswer": {
      "fr": "La vraie réponse ne dépend ni de l'endroit où le chirurgien a été formé, ni de ses années de pratique, mais de sa préparation à sauver une vie.",
      "en": "The real answer is not where a surgeon was trained or how long they have practised, but how well prepared they are to save a life."
    }
  },
  {
    "id": "arnaud-dzudie",
    "name": "Arnaud Dzudie",
    "role": {
      "fr": "Consultant business",
      "en": "Business Consultant"
    },
    "company": "",
    "photoUrl": "/speakers/arnaud-dzudie.webp",
    "bio": {
      "fr": "Titulaire d’une Maitrise en Economie-Finance et d’un Master spécialisé en Management, Stratégie et Gestion des Systèmes d’informations, Arnaud DZUDIE est un consultant associé ayant cumulé une dizaine d’années au sein d’environnements locaux et internationaux dans l’administration des entreprises, la gestion de projets numériques et le développement du capital humain domaine dans lequel il a été associé jusqu’à date à la gestion de process de recrutement d’une centaine de profils.\nEn outre, Il a participé à l’accompagnement de plusieurs dizaines de jeunes au travers de conférences Daytona Tour Yaoundé Septembre 2025, Forum des métiers du numérique 10 000 Codeurs 2026, dans les Instituts supérieurs de formation professionnelle, pendant les stages professionnels en entreprises et au sein d’organismes (AIESEC, APFAJ). Coté entrepreneuriat, il a participé à l’évaluation de 40 PMEs dans le cadre du processus de sélection entrepreneurial associé à l’édition 2023 du Mandela Fellowship Program du YALI (Young African Leaders Initiative).\nDisposant d’une certification en Analyse des Politiques Publiques, Il accorde un intérêt particulier aux ODD 8 et 9 ainsi que les politiques gouvernementales relatives à l’accès à l’emploi, aux TIC et à la croissance des PMEs.",
      "en": "With a Maîtrise in Economics & Finance and a specialised Master's in Management, Strategy and Information Systems, Arnaud DZUDIE is a partner consultant with around ten years' experience in local and international environments, spanning business administration, digital project management and human capital development — a field in which he has, to date, been involved in recruitment processes for about a hundred profiles.\nHe has also mentored dozens of young people through talks (Daytona Tour Yaoundé, September 2025; the 10,000 Codeurs digital careers forum, 2026), in vocational training institutes, during company internships and within organisations (AIESEC, APFAJ). On the entrepreneurship side, he took part in evaluating 40 SMEs during the selection process for the 2023 edition of YALI's Mandela Fellowship Program (Young African Leaders Initiative).\nHolding a certification in Public Policy Analysis, he takes a particular interest in SDGs 8 and 9 and in government policies on access to employment, ICT and SME growth."
    },
    "track": {
      "fr": "Business",
      "en": "Business"
    },
    "day": 1,
    "sessionIds": [
      "sz-1368723"
    ],
    "social": {
      "linkedin": "https://www.linkedin.com/in/arnaud-arnaud/"
    },
    "icebreakerQuestion": {
      "fr": "—",
      "en": "—"
    },
    "icebreakerAnswer": {
      "fr": "—",
      "en": "—"
    }
  },
  {
    "id": "anita-dongmo",
    "name": "Anita Dongmo",
    "role": {
      "fr": "Étudiante en Master 2 Data Science (Université de Yaoundé I) · IT Manager",
      "en": "Master's student in Data Science (University of Yaoundé I) · IT Manager"
    },
    "company": "Kaizen Me",
    "photoUrl": "/speakers/anita-dongmo.webp",
    "bio": {
      "fr": "Anita Dongmo est étudiante en Master 2 Data Science à l’Université de Yaoundé I. Elle exerce comme IT Manager chez Kaizen Me et poursuit une expérience professionnelle chez Likabo, dans l’environnement Data & IA, où elle approfondit sa compréhension des écosystèmes Microsoft, du cloud et des usages de la donnée. Elle s’intéresse au Machine Learning, à l’intelligence artificielle et à l’automatisation des tâches. Entre projets data, responsabilités IT et vulgarisation technologique, elle explore comment rendre les technologies accessibles et utiles face aux problèmes concrets du quotidien.",
      "en": "Anita Dongmo is a second-year Master's student in Data Science at the University of Yaoundé I. She works as IT Manager at Kaizen Me and is also building professional experience at Likabo, in the Data & AI space, where she is deepening her understanding of Microsoft ecosystems, the cloud and the ways data is used. She is interested in machine learning, artificial intelligence and task automation. Between data projects, IT responsibilities and explaining technology to wider audiences, she explores how to make technology accessible and useful for everyday, real-world problems."
    },
    "track": {
      "fr": "IA & ML",
      "en": "AI & ML"
    },
    "day": 1,
    "sessionIds": [
      "sz-1369967"
    ],
    "social": {
      "linkedin": "https://www.linkedin.com/in/anita-dongmo-278861306",
      "website": "https://kaizenme.cm"
    },
    "icebreakerQuestion": {
      "fr": "Quelle est la compétence la plus sous-estimée dans la tech ?",
      "en": "What's the most underrated skill in tech?"
    },
    "icebreakerAnswer": {
      "fr": "Oser commencer sans tout savoir. Les outils évoluent, les connaissances se construisent, mais la volonté d’expérimenter transforme la curiosité en compétence.",
      "en": "Daring to start without knowing everything. Tools change and knowledge builds up, but the willingness to experiment is what turns curiosity into skill."
    }
  },
  {
    "id": "sandra-macheu-talla",
    "name": "Sandra Macheu Talla",
    "role": {
      "fr": "Étudiante en 4e année d'ingénierie, systèmes, réseaux et télécoms",
      "en": "4th-year engineering student, Network Systems & Telecoms"
    },
    "company": "",
    "photoUrl": "/speakers/sandra-macheu-talla.webp",
    "bio": {
      "fr": "Étudiante en ingénierie des télécommunications et systèmes. Toujours curieuse d'explorer les coulisses des infrastructures informatiques et des réseaux de demain. J'aime m'instruire sur des sujets complexes pour les rendre accessibles. Pour ma toute première intervention au DevFest, je suis ravie de partager mon retour d'expérience et ma vision avec la communauté tech.",
      "en": "An engineering student in telecommunications and systems. Always curious to explore what goes on behind the scenes of IT infrastructure and tomorrow's networks, I love learning about complex topics so I can make them accessible. For my very first DevFest talk, I'm delighted to share my experience and my vision with the tech community."
    },
    "track": {
      "fr": "Cloud",
      "en": "Cloud"
    },
    "day": 1,
    "sessionIds": [
      "sz-1371401"
    ],
    "social": {
      "linkedin": "https://www.linkedin.com/in/sandra-macheu-talla-296a99321"
    },
    "icebreakerQuestion": {
      "fr": "—",
      "en": "—"
    },
    "icebreakerAnswer": {
      "fr": "—",
      "en": "—"
    }
  },
  {
    "id": "verdiane-fotso",
    "name": "Verdiane Fotso",
    "role": {
      "fr": "Étudiante ingénieure en réseaux et télécommunications",
      "en": "Networks & Telecommunications Engineering Student"
    },
    "company": "",
    "photoUrl": "/speakers/verdiane-fotso.webp",
    "bio": {
      "fr": "Verdiane Fotso est étudiante ingénieure en Systèmes, Réseaux et Télécommunications, passionnée par les réseaux informatiques, la cybersécurité et l’intelligence artificielle.",
      "en": "Verdiane Fotso is an engineering student in Systems, Networks and Telecommunications, passionate about computer networks, cybersecurity and artificial intelligence."
    },
    "track": {
      "fr": "IA & ML",
      "en": "AI & ML"
    },
    "day": 1,
    "sessionIds": [
      "sz-1371405"
    ],
    "icebreakerQuestion": {
      "fr": "Le plus grand frisson en administration réseau ?",
      "en": "The biggest thrill in network administration?"
    },
    "icebreakerAnswer": {
      "fr": "Appuyez sur « entrée » après une config.. et prier pour que le réseau réponde encore. D’où l’intérêt d’automatiser tout ça avec l’IA.",
      "en": "Hitting Enter after a config change… and praying the network still answers. Hence automating all of it with AI."
    }
  },
  {
    "id": "ange-naomy-kengne-takoumbo",
    "name": "Ange Naomy Kengne Takoumbo",
    "role": {
      "fr": "Aspirante ingénieure en Systèmes, Réseaux et Télécommunications",
      "en": "Aspiring Systems, Networks & Telecommunications Engineer"
    },
    "company": "",
    "photoUrl": "/speakers/ange-naomy-kengne-takoumbo.webp",
    "bio": {
      "fr": "« Apprendre en construisant, grandir en partageant. » Étudiante curieuse et ouverte aux partages d’expérience, je souhaite contribuer à la communauté tech en partageant un projet concret et des connaissances acquises au cours de mon parcours.",
      "en": "“Learn by building, grow by sharing.” A curious student who loves exchanging experiences, I want to contribute to the tech community by sharing a concrete project and the knowledge I've gained along the way."
    },
    "track": {
      "fr": "DevOps",
      "en": "DevOps"
    },
    "day": 1,
    "sessionIds": [
      "sz-1371413"
    ],
    "social": {
      "linkedin": "https://www.linkedin.com/in/ange-naomy-kengne-takoumbo-b08a66308"
    },
    "icebreakerQuestion": {
      "fr": "—",
      "en": "—"
    },
    "icebreakerAnswer": {
      "fr": "—",
      "en": "—"
    }
  },
  {
    "id": "nathan-foka",
    "name": "Nathan Foka",
    "role": {
      "fr": "Membre de la communauté",
      "en": "Community member"
    },
    "company": "GDG Yaoundé",
    "photoUrl": "/speakers/nathan-foka.webp",
    "bio": {
      "fr": "Je suis Nathan FOKA, passionné de Gestion de Projet et de Technologies Numériques, je m'intéresse à l'écosystème Google et à son potentiel pour améliorer la productivité et simplifier les processus de travail. Je souhaite approfondir mes compétences dans les outils Google Workspace, en automatisation et en création de solutions numériques accessibles. À travers cette session, je souhaite partager une démarche pratique pour aider les débutants à découvrir cet écosystème, identifier les compétences à développer et construire leur propre parcours d'apprentissage.",
      "en": "I'm Nathan FOKA, passionate about project management and digital technologies, with a keen interest in the Google ecosystem and its potential to boost productivity and simplify how we work. I want to deepen my skills in Google Workspace tools, automation and building accessible digital solutions. Through this session, I want to share a hands-on approach to help beginners discover this ecosystem, identify the skills to build and shape their own learning path."
    },
    "track": {
      "fr": "Web",
      "en": "Web"
    },
    "day": 1,
    "sessionIds": [
      "sz-1372363"
    ],
    "social": {
      "linkedin": "https://www.linkedin.com/in/nathan-foka-3aa452232"
    },
    "icebreakerQuestion": {
      "fr": "—",
      "en": "—"
    },
    "icebreakerAnswer": {
      "fr": "—",
      "en": "—"
    }
  },
  {
    "id": "hubert-nang",
    "name": "Hubert Nang",
    "role": {
      "fr": "Ingénieur Cloud & Automatisation",
      "en": "Cloud & Automation Engineer"
    },
    "company": "DevOps Cameroon",
    "photoUrl": "/speakers/hubert-nang.webp",
    "bio": {
      "fr": "Cloud & Automation Engineer, avec plus de 6 ans d'expérience multicloud et DevOps et plus de 10 ans dans la tech. Co-fondateur de DevOps Cameroon",
      "en": "Cloud & Automation Engineer with over 6 years of multi-cloud and DevOps experience and more than 10 years in tech. Co-founder of DevOps Cameroon."
    },
    "track": {
      "fr": "Cloud",
      "en": "Cloud"
    },
    "day": 1,
    "sessionIds": [
      "sz-1372444"
    ],
    "social": {
      "linkedin": "https://www.linkedin.com/in/hubert-nang-0655ba172/"
    },
    "icebreakerQuestion": {
      "fr": "—",
      "en": "—"
    },
    "icebreakerAnswer": {
      "fr": "—",
      "en": "—"
    }
  },
  {
    "id": "le-prince-dachi",
    "name": "Le Prince Dachi",
    "role": {
      "fr": "Expert en cybersécurité · Sécurité et gouvernance de l'IA",
      "en": "Cybersecurity Expert · AI Security & Governance"
    },
    "company": "",
    "photoUrl": "/speakers/le-prince-dachi.webp",
    "bio": {
      "fr": "Expert en cybersécurité, je suis spécialisé dans la gouvernance de la sécurité de l'information, la gestion des risques et la conception d'applications sécurisées. J'accompagne les organisations dans le renforcement de leur posture de sécurité et j'aide les équipes techniques à intégrer des pratiques de sécurité concrètes tout au long du cycle de développement.\n\nJe m'intéresse aussi à la sécurité et à la gouvernance de l'IA, en particulier aux nouveaux défis que pose la sécurisation des applications d'IA générative, et à la promotion d'une adoption responsable de l'IA.\n\nPassionné par le partage de connaissances, je veux rendre la cybersécurité accessible et concrète pour les développeurs et les professionnels de la tech, et contribuer à un écosystème numérique plus sûr et plus résilient.",
      "en": "I am a Cybersecurity Expert specializing in information security governance, risk management, and secure application design. I support organizations in strengthening their security posture and help technical teams integrate practical security practices throughout the development lifecycle.\n\nMy interests also extend to AI security and governance, particularly the emerging challenges of securing generative AI applications and promoting the responsible adoption of AI technologies.\n\nPassionate about knowledge sharing, I aim to make cybersecurity accessible and actionable for developers and technology professionals, contributing to a safer and more resilient digital ecosystem."
    },
    "track": {
      "fr": "Cybersécurité",
      "en": "Cybersecurity"
    },
    "day": 1,
    "sessionIds": [
      "sz-1372498"
    ],
    "social": {
      "linkedin": "https://www.linkedin.com/in/le-prince-dachi"
    },
    "icebreakerQuestion": {
      "fr": "Si tu pouvais régler un seul problème de cybersécurité dans le monde de la tech aujourd'hui, lequel serait-ce ?",
      "en": "If you could fix one cybersecurity issue in the tech world today, what would it be?"
    },
    "icebreakerAnswer": {
      "fr": "Faire de la sécurité un élément central de chaque application dès le premier jour, y compris les applications propulsées par l'IA. La sécurité doit permettre l'innovation, pas la freiner.",
      "en": "Making security a core part of every application from day one, including AI-powered applications. Security should enable innovation, not slow it down."
    }
  },
  {
    "id": "marie-ipouk",
    "name": "Marie Ipouk",
    "role": {
      "fr": "Data scientist",
      "en": "Data Scientist"
    },
    "company": "",
    "photoUrl": "/speakers/marie-ipouk.webp",
    "bio": {
      "fr": "Data scientist et chercheuse",
      "en": "Data Scientist and researcher"
    },
    "track": {
      "fr": "IA & ML",
      "en": "AI & ML"
    },
    "day": 1,
    "sessionIds": [
      "sz-1373948"
    ],
    "social": {
      "x": "https://x.com/MarieIpk",
      "linkedin": "https://www.linkedin.com/in/marie-victoire-ipouk-a11633300/"
    },
    "icebreakerQuestion": {
      "fr": "—",
      "en": "—"
    },
    "icebreakerAnswer": {
      "fr": "—",
      "en": "—"
    }
  },
  {
    "id": "david-njome",
    "name": "David Njome",
    "role": {
      "fr": "Étudiant en 4e année de Génie Informatique à l'ENSPY · Chef de la Cellule Projet du Club GI",
      "en": "4th-year Computer Engineering student at ENSPY · Head of the GI Club's Project Unit"
    },
    "company": "",
    "photoUrl": "/speakers/david-njome.webp",
    "bio": {
      "fr": "Njome David est étudiant en 4e année de Génie Informatique à l'École Nationale Supérieure Polytechnique de Yaoundé et Chef de la Cellule Projet du Club GI de l'école. Il a construit \"Assistant Campus\", un agent de démonstration qui sert de support pédagogique pour ce talk. Son objectif n'est pas de présenter un produit fini, mais de montrer que la stack Google est accessible à quiconque voudrait apprendre ou réaliser ses propres projets d'IA. Il croit qu'on apprend mieux en voyant comment les choses devraient être faites, même sans de notions réellement techniques.",
      "en": "Njome David is a 4th-year Computer Engineering student at the National Advanced School of Engineering of Yaoundé (ENSPY) and head of the school's GI Club Project Unit. He built “Assistant Campus”, a demo agent that serves as the teaching material for this talk. His aim isn't to present a finished product but to show that the Google stack is within reach of anyone who wants to learn or build their own AI projects. He believes we learn best by seeing how things should be done, even without much technical background."
    },
    "track": {
      "fr": "Cloud",
      "en": "Cloud"
    },
    "day": 1,
    "sessionIds": [
      "sz-1376249"
    ],
    "social": {
      "linkedin": "https://www.linkedin.com/in/njome-david-002a11213"
    },
    "icebreakerQuestion": {
      "fr": "Quelle est votre expérience la plus frustrante avec l'IA ?",
      "en": "What's your most frustrating experience with AI?"
    },
    "icebreakerAnswer": {
      "fr": "J'ai épuisé l'entièreté de mes crédits en essayant de résoudre un problème où l'IA ne faisait que tourner en boucle sur la même erreur.",
      "en": "I burned through all my credits trying to fix a problem where the AI just kept looping on the same error."
    }
  },
  {
    "id": "noemie-youbissi",
    "name": "Noémie Youbissi",
    "role": {
      "fr": "Étudiante ingénieure en systèmes réseaux et télécommunications · Saint Jean Ingénieur",
      "en": "Engineering student, Network Systems & Telecommunications · Saint Jean Ingénieur"
    },
    "company": "",
    "photoUrl": "/speakers/noemie-youbissi.webp",
    "bio": {
      "fr": "Je suis actuellement en quatrième année d'école d'ingénieurs, en systèmes réseaux et télécommunications. Je suis aussi vice-leader de l'AWS Student Builder Group de l'IUSJC.",
      "en": "I'm currently a fourth year engineering student in Network Systems and Telecommunications. Moreover, I'm also the AWS Student Builder Group IUSJC's vice leader."
    },
    "track": {
      "fr": "Cybersécurité",
      "en": "Cybersecurity"
    },
    "day": 1,
    "sessionIds": [
      "sz-1376670"
    ],
    "social": {
      "linkedin": "https://www.linkedin.com/in/no%C3%A9mie-amanda-n/"
    },
    "icebreakerQuestion": {
      "fr": "—",
      "en": "—"
    },
    "icebreakerAnswer": {
      "fr": "—",
      "en": "—"
    }
  },
  {
    "id": "raissa-wokmeni",
    "name": "Raïssa Wokmeni",
    "role": {
      "fr": "Étudiante en 5e année de Génie Informatique à l'ENSPY",
      "en": "5th-year Computer Engineering student at ENSPY"
    },
    "company": "",
    "photoUrl": "/speakers/raissa-wokmeni.webp",
    "bio": {
      "fr": "Wokmeni Raïssa est étudiante en dernière année de Génie Informatique à l'École Nationale Supérieure Polytechnique de Yaoundé (ENSPY), au Cameroun. Elle est passionnée par le développement logiciel, l'innovation et les nouvelles façons de construire des solutions numériques.\n\nAu fil de son parcours académique et de projets concrets, elle a exploré le développement web, de la conception d'interfaces à l'implémentation de fonctionnalités, tout en découvrant des outils et des pratiques qui rendent le travail des développeurs plus efficace.\n\nCurieuse des possibilités de l'intelligence artificielle, elle explore activement comment l'IA peut l'aider au quotidien : structurer ses idées, explorer des solutions, automatiser les tâches répétitives et gagner en productivité. Elle reste toutefois convaincue que l'IA doit rester un assistant et non un substitut à l'esprit critique : comprendre, questionner, relire et tester restent au cœur du métier de développeur.\n\nAu-delà du code, Raïssa s'intéresse à l'entrepreneuriat tech, au leadership et à l'innovation en Afrique. Elle aime partager des expériences concrètes et les leçons apprises en chemin, convaincue qu'on grandit en expérimentant, en se trompant, en apprenant et en recommençant.",
      "en": "Wokmeni Raïssa is a final-year Computer Engineering student at the National Advanced School of Engineering of Yaoundé (ENSPY), Cameroon. She is passionate about software development, innovation, and new approaches to building digital solutions.\n\nThroughout her academic journey and hands-on experience with various projects, she has explored web development, from user interface design to feature implementation, while discovering tools and practices that make developers' workflows more efficient.\n\nCurious about the possibilities of artificial intelligence, she actively explores how AI can support her everyday development process, particularly in structuring ideas, exploring solutions, automating repetitive tasks, and improving productivity. However, she believes AI should remain an assistant rather than a substitute for critical thinking: understanding, questioning, reviewing, and testing are still essential parts of being a developer.\n\nBeyond coding, Raïssa is interested in technology entrepreneurship, leadership, and innovation in Africa. She enjoys sharing practical experiences and lessons learned along the way, believing that growth comes from experimenting, making mistakes, learning, and trying again."
    },
    "track": {
      "fr": "Web",
      "en": "Web"
    },
    "day": 1,
    "sessionIds": [
      "sz-1376783"
    ],
    "social": {
      "linkedin": "https://www.linkedin.com/in/ra%C3%AFssa-w-0a6b1b233"
    },
    "icebreakerQuestion": {
      "fr": "—",
      "en": "—"
    },
    "icebreakerAnswer": {
      "fr": "—",
      "en": "—"
    }
  },
  {
    "id": "freddy-choudja",
    "name": "Freddy Choudja",
    "role": {
      "fr": "Lead Developer",
      "en": "Lead Developer"
    },
    "company": "Modulis Tech",
    "photoUrl": "/speakers/freddy-choudja.webp",
    "bio": {
      "fr": "Freddy Choudja est Lead Developer chez Modulis Tech et Front-End Lead chez Hakkilo XR. Étudiant à l'Université de Yaoundé I, il conçoit des applications variées et s'implique activement dans l'écosystème open-source en tant qu'organisateur principal du Hacktoberfest Yaoundé. Passionné par l'automatisation des flux de travail et l'intégration des outils d'IA, il partage son expérience pratique de l'ingénierie logicielle moderne.",
      "en": "Freddy Choudja is Lead Developer at Modulis Tech and Front-End Lead at Hakkilo XR. A student at the University of Yaoundé I, he builds a wide range of applications and is actively involved in the open-source ecosystem as lead organiser of Hacktoberfest Yaoundé. Passionate about workflow automation and integrating AI tools, he shares his hands-on experience of modern software engineering."
    },
    "track": {
      "fr": "IA & ML",
      "en": "AI & ML"
    },
    "day": 1,
    "sessionIds": [
      "sz-1377020"
    ],
    "social": {
      "linkedin": "https://www.linkedin.com/in/freddy-choudja-2a662a330/",
      "website": "https://modulis.tech/"
    },
    "icebreakerQuestion": {
      "fr": "Comment évitez-vous que votre agent IA ne réécrive n'importe quoi lors de la création d'une fonctionnalité ?",
      "en": "How do you stop your AI agent from rewriting just anything when it builds a feature?"
    },
    "icebreakerAnswer": {
      "fr": "En lui imposant une constitution stricte et des spécifications claires grâce à GitHub Spec Kit, plutôt que de lui confier du code à l'aveugle !",
      "en": "By giving it a strict constitution and clear specifications with GitHub Spec Kit, rather than handing it code blindly!"
    }
  }
]$lineup$::jsonb, now(), null)
on conflict (id) do update
  set payload = excluded.payload,
      updated_at = excluded.updated_at,
      updated_by = excluded.updated_by;

insert into public.editorial_documents (id, payload, updated_at, updated_by)
values ('sessions', $lineup$[
  {
    "id": "sz-1339016",
    "day": 1,
    "kind": "workshop",
    "level": "intermediate",
    "language": [
      "fr"
    ],
    "originalLanguage": "fr",
    "title": {
      "fr": "Au-delà du vibe coding pour le Web",
      "en": "Au-delà du vibe coding pour le Web"
    },
    "description": {
      "fr": "Alors que le Vibe Coding se répand de plus en plus, dans cette session j'explique comment utiliser les agents d'IA comme partenaires actifs et collaboratifs, avec des pratiques destinées à vous aider à réduire la dette technique et à améliorer la qualité du code généré. Vous utilisez Antigravity associé à Modern Web Guidance et DevTools for Agents pour créer un jeu de mots occasionnel et l'améliorer grâce aux fonctionnalités d'IA. Vous le déployez ensuite sur Google Cloud à l'aide de Firebase pour le partager avec vos amis et votre famille.",
      "en": "Alors que le Vibe Coding se répand de plus en plus, dans cette session j'explique comment utiliser les agents d'IA comme partenaires actifs et collaboratifs, avec des pratiques destinées à vous aider à réduire la dette technique et à améliorer la qualité du code généré. Vous utilisez Antigravity associé à Modern Web Guidance et DevTools for Agents pour créer un jeu de mots occasionnel et l'améliorer grâce aux fonctionnalités d'IA. Vous le déployez ensuite sur Google Cloud à l'aide de Firebase pour le partager avec vos amis et votre famille."
    },
    "track": {
      "fr": "Web",
      "en": "Web"
    },
    "tags": [
      {
        "fr": "Web",
        "en": "Web"
      },
      {
        "fr": "IA & ML",
        "en": "AI & ML"
      }
    ],
    "speakerIds": [
      "cabrel-domfang"
    ]
  },
  {
    "id": "sz-1350359",
    "day": 1,
    "kind": "workshop",
    "level": "intermediate",
    "language": [
      "en"
    ],
    "originalLanguage": "en",
    "title": {
      "fr": "From git push to Production: CI/CD in the Age of AI",
      "en": "From git push to Production: CI/CD in the Age of AI"
    },
    "description": {
      "fr": "What really happens after git push?\n\nIn this visual, hands-on workshop, we’ll follow code from GitHub through CI, staging, and production using Google Cloud. We’ll intentionally break the pipeline, watch it fail, fix it, and see how AI-generated code can be caught by automated quality gates.\n\nCode → CI → Delivery → Production.",
      "en": "What really happens after git push?\n\nIn this visual, hands-on workshop, we’ll follow code from GitHub through CI, staging, and production using Google Cloud. We’ll intentionally break the pipeline, watch it fail, fix it, and see how AI-generated code can be caught by automated quality gates.\n\nCode → CI → Delivery → Production."
    },
    "track": {
      "fr": "Cloud",
      "en": "Cloud"
    },
    "tags": [
      {
        "fr": "Cloud",
        "en": "Cloud"
      },
      {
        "fr": "DevOps",
        "en": "DevOps"
      }
    ],
    "speakerIds": [
      "egbe-michel"
    ]
  },
  {
    "id": "sz-1350410",
    "day": 1,
    "kind": "talk",
    "lightning": true,
    "level": "intermediate",
    "language": [
      "fr",
      "en"
    ],
    "originalLanguage": "fr",
    "title": {
      "fr": "It works, don't touch it: LOL",
      "en": "It works, don't touch it: LOL"
    },
    "description": {
      "fr": "Sous l'illusion d'un code qui fonctionne et dont les tests passent au vert se cachent souvent des failles critiques prêtes à exploser en production. Cette présentation propose une plongée offensive et sans filtre — du From Scratch aux frameworks modernes et CMS — pour décortiquer ce qui pique vraiment dans vos architectures (IDOR, injections SQL, fuites de secrets). À travers des cas concrets et une démonstration offensive, nous verrons comment les attaquants cassent vos systèmes, quel est le coût réel pour l'entreprise, et comment appliquer des correctifs chirurgicaux pour coder l'esprit tranquille dès le lendemain.",
      "en": "Sous l'illusion d'un code qui fonctionne et dont les tests passent au vert se cachent souvent des failles critiques prêtes à exploser en production. Cette présentation propose une plongée offensive et sans filtre — du From Scratch aux frameworks modernes et CMS — pour décortiquer ce qui pique vraiment dans vos architectures (IDOR, injections SQL, fuites de secrets). À travers des cas concrets et une démonstration offensive, nous verrons comment les attaquants cassent vos systèmes, quel est le coût réel pour l'entreprise, et comment appliquer des correctifs chirurgicaux pour coder l'esprit tranquille dès le lendemain."
    },
    "track": {
      "fr": "Cybersécurité",
      "en": "Cybersecurity"
    },
    "tags": [
      {
        "fr": "Cybersécurité",
        "en": "Cybersecurity"
      }
    ],
    "speakerIds": [
      "linda-ebete"
    ]
  },
  {
    "id": "sz-1351469",
    "day": 1,
    "kind": "talk",
    "lightning": true,
    "level": "intermediate",
    "language": [
      "fr",
      "en"
    ],
    "originalLanguage": "en",
    "title": {
      "fr": "Beyond Code Generation: Building Better Software with AI Coding Assistants",
      "en": "Beyond Code Generation: Building Better Software with AI Coding Assistants"
    },
    "description": {
      "fr": "AI coding assistants are changing how developers write, understand, test, debug, and maintain software. But using AI effectively goes far beyond asking it to generate code.\nIn this practical session, we’ll explore how developers can integrate AI into their everyday engineering workflow from understanding unfamiliar codebases and generating tests to debugging, refactoring, documenting, and reviewing code. We’ll also discuss common mistakes, limitations, and best practices for keeping developers in control of the final result.\nThe goal is not to replace developers, but to learn how to work with AI as an engineering partner and use it to become more productive without sacrificing code quality, security, or understanding.",
      "en": "AI coding assistants are changing how developers write, understand, test, debug, and maintain software. But using AI effectively goes far beyond asking it to generate code.\nIn this practical session, we’ll explore how developers can integrate AI into their everyday engineering workflow from understanding unfamiliar codebases and generating tests to debugging, refactoring, documenting, and reviewing code. We’ll also discuss common mistakes, limitations, and best practices for keeping developers in control of the final result.\nThe goal is not to replace developers, but to learn how to work with AI as an engineering partner and use it to become more productive without sacrificing code quality, security, or understanding."
    },
    "track": {
      "fr": "IA & ML",
      "en": "AI & ML"
    },
    "tags": [
      {
        "fr": "IA & ML",
        "en": "AI & ML"
      },
      {
        "fr": "Cybersécurité",
        "en": "Cybersecurity"
      },
      {
        "fr": "Web",
        "en": "Web"
      },
      {
        "fr": "Cloud",
        "en": "Cloud"
      }
    ],
    "speakerIds": [
      "danwe-basga"
    ]
  },
  {
    "id": "sz-1352359",
    "day": 1,
    "kind": "talk",
    "lightning": true,
    "level": "expert",
    "language": [
      "fr",
      "en"
    ],
    "originalLanguage": "en",
    "title": {
      "fr": "Building AI Agents for Africa: From Chatbots to Autonomous Digital Workers",
      "en": "Building AI Agents for Africa: From Chatbots to Autonomous Digital Workers"
    },
    "description": {
      "fr": "AI is moving beyond simple chatbots. The next generation of applications will be AI agents capable of understanding context, using tools, interacting with users, and executing real-world tasks.\n\nIn this session, we will explore how developers can build practical AI agents for African businesses and users — from customer support and sales to operations, automation, and digital commerce.\n\nI will share lessons from building AI-powered products in Cameroon, including the architectural decisions, tools, challenges, and opportunities involved in taking an AI agent from an idea to a production-ready system.\n\nThe session will focus on practical concepts developers can apply immediately: agent architecture, tool calling, workflows, integrations, human-in-the-loop systems, and designing AI products for environments where connectivity, cost, trust, and local business realities matter.\n\nThe goal is simple: move from experimenting with AI to actually building useful AI-powered products for Africa.",
      "en": "AI is moving beyond simple chatbots. The next generation of applications will be AI agents capable of understanding context, using tools, interacting with users, and executing real-world tasks.\n\nIn this session, we will explore how developers can build practical AI agents for African businesses and users — from customer support and sales to operations, automation, and digital commerce.\n\nI will share lessons from building AI-powered products in Cameroon, including the architectural decisions, tools, challenges, and opportunities involved in taking an AI agent from an idea to a production-ready system.\n\nThe session will focus on practical concepts developers can apply immediately: agent architecture, tool calling, workflows, integrations, human-in-the-loop systems, and designing AI products for environments where connectivity, cost, trust, and local business realities matter.\n\nThe goal is simple: move from experimenting with AI to actually building useful AI-powered products for Africa."
    },
    "track": {
      "fr": "IA & ML",
      "en": "AI & ML"
    },
    "tags": [
      {
        "fr": "IA & ML",
        "en": "AI & ML"
      },
      {
        "fr": "Design UX/UI",
        "en": "UX/UI Design"
      },
      {
        "fr": "DevOps",
        "en": "DevOps"
      },
      {
        "fr": "Gestion de produit",
        "en": "Product Management"
      },
      {
        "fr": "Business",
        "en": "Business"
      }
    ],
    "speakerIds": [
      "rostand-tchuekam"
    ]
  },
  {
    "id": "sz-1352668",
    "day": 1,
    "kind": "talk",
    "lightning": true,
    "level": "introductory",
    "language": [
      "fr"
    ],
    "originalLanguage": "fr",
    "title": {
      "fr": "Code vs Cahier : Pourquoi votre plus grand concurrent est un registre en papier",
      "en": "Code vs Cahier : Pourquoi votre plus grand concurrent est un registre en papier"
    },
    "description": {
      "fr": "1. Le choc de la réalité du terrain (Reality Check)\nLes développeurs ont tendance à concevoir des applications en se comparant aux géants du SaaS ou à d'autres startups. Sur le terrain (commerce local, logistique, chantiers, santé), le véritable adversaire est souvent un carnet à 2 €, un registre manuscrit ou un carnet de reçus sous carbone. Aborder ce sujet ramène la conception logicielle à la vraie vie des utilisateurs.\n2. La leçon d'UX ultime : La friction zéro\nUn carnet physique possède des arguments imbattables : zéro temps de chargement, pas de mot de passe à réinitialiser, pas d'erreur 500, pas de formation requise et une batterie infinie. Ce thème permet de challenger les devs sur la vitesse d'exécution et l'ergonomie : si saisir une vente prend 4 clics et 10 secondes dans ton app alors qu'il faut 2 secondes au stylo, ton logiciel perd.\n3. La lutte contre la sur-ingénierie (Feature Creep)\nLes équipes techniques passent parfois des semaines à intégrer des fonctionnalités complexes (tableaux de bord animés, IA, exports avancés) alors que l'utilisateur veut juste valider une transaction sans réfléchir. Le registre physique rappelle l'importance du « Less is more » et de la valeur fondamentale d'un produit.\n4. Un levier pour aborder des sujets techniques concrets\nCe sujet n'est pas qu'ergonomique, il ouvre la porte à d'excellentes discussions d'architecture logicielle :\n Offline-First : Comment garantir le fonctionnement sans réseau, à l'image du papier.\n Saisie ultra-rapide : Raccourcis clavier, interfaces formulaires optimisées, optimisations des requêtes.\n Synchronisation et résilience : Gestion des conflits de données quand la connexion revient.",
      "en": "1. Le choc de la réalité du terrain (Reality Check)\nLes développeurs ont tendance à concevoir des applications en se comparant aux géants du SaaS ou à d'autres startups. Sur le terrain (commerce local, logistique, chantiers, santé), le véritable adversaire est souvent un carnet à 2 €, un registre manuscrit ou un carnet de reçus sous carbone. Aborder ce sujet ramène la conception logicielle à la vraie vie des utilisateurs.\n2. La leçon d'UX ultime : La friction zéro\nUn carnet physique possède des arguments imbattables : zéro temps de chargement, pas de mot de passe à réinitialiser, pas d'erreur 500, pas de formation requise et une batterie infinie. Ce thème permet de challenger les devs sur la vitesse d'exécution et l'ergonomie : si saisir une vente prend 4 clics et 10 secondes dans ton app alors qu'il faut 2 secondes au stylo, ton logiciel perd.\n3. La lutte contre la sur-ingénierie (Feature Creep)\nLes équipes techniques passent parfois des semaines à intégrer des fonctionnalités complexes (tableaux de bord animés, IA, exports avancés) alors que l'utilisateur veut juste valider une transaction sans réfléchir. Le registre physique rappelle l'importance du « Less is more » et de la valeur fondamentale d'un produit.\n4. Un levier pour aborder des sujets techniques concrets\nCe sujet n'est pas qu'ergonomique, il ouvre la porte à d'excellentes discussions d'architecture logicielle :\n Offline-First : Comment garantir le fonctionnement sans réseau, à l'image du papier.\n Saisie ultra-rapide : Raccourcis clavier, interfaces formulaires optimisées, optimisations des requêtes.\n Synchronisation et résilience : Gestion des conflits de données quand la connexion revient."
    },
    "track": {
      "fr": "Gestion de produit",
      "en": "Product Management"
    },
    "tags": [
      {
        "fr": "Gestion de produit",
        "en": "Product Management"
      },
      {
        "fr": "Business",
        "en": "Business"
      }
    ],
    "speakerIds": [
      "steve-kambea-ndjeumou"
    ]
  },
  {
    "id": "sz-1353400",
    "day": 1,
    "kind": "talk",
    "lightning": true,
    "level": "introductory",
    "language": [
      "fr",
      "en"
    ],
    "originalLanguage": "fr",
    "title": {
      "fr": "AI-Powered Learning: How to Learn Smarter",
      "en": "AI-Powered Learning: How to Learn Smarter"
    },
    "description": {
      "fr": "Ce thème explore comment l’intelligence artificielle peut nous aider à apprendre de manière plus efficace, plus personnalisée et plus active. Il ne s’agit pas simplement d’utiliser l’IA pour obtenir des réponses, mais de comprendre comment s’en servir pour mieux réviser, approfondir un sujet, identifier ses difficultés, pratiquer, recevoir des explications adaptées à son niveau et développer une meilleure méthode d’apprentissage.\n\nL’objectif est de montrer comment faire de l’IA un véritable outil d’accompagnement, sans remplacer la réflexion, l’effort personnel ni l’esprit critique.",
      "en": "Ce thème explore comment l’intelligence artificielle peut nous aider à apprendre de manière plus efficace, plus personnalisée et plus active. Il ne s’agit pas simplement d’utiliser l’IA pour obtenir des réponses, mais de comprendre comment s’en servir pour mieux réviser, approfondir un sujet, identifier ses difficultés, pratiquer, recevoir des explications adaptées à son niveau et développer une meilleure méthode d’apprentissage.\n\nL’objectif est de montrer comment faire de l’IA un véritable outil d’accompagnement, sans remplacer la réflexion, l’effort personnel ni l’esprit critique."
    },
    "track": {
      "fr": "IA & ML",
      "en": "AI & ML"
    },
    "tags": [
      {
        "fr": "IA",
        "en": "AI"
      }
    ],
    "speakerIds": [
      "samuel-de-essaka"
    ]
  },
  {
    "id": "sz-1353994",
    "day": 1,
    "kind": "talk",
    "lightning": true,
    "level": "intermediate",
    "language": [
      "fr"
    ],
    "originalLanguage": "fr",
    "title": {
      "fr": "VPS ou Cloud : comment choisir la bonne infrastructure pour son application ?",
      "en": "VPS ou Cloud : comment choisir la bonne infrastructure pour son application ?"
    },
    "description": {
      "fr": "Cette question revient souvent lorsqu’on doit déployer une application, un site web ou une API. Pourtant, le meilleur choix ne dépend pas uniquement du prix ou du fait que « le cloud est plus moderne et plus flexible ».\n\nDans cette session, nous allons comparer concrètement les deux approches et surtout comprendre quand choisir un VPS, quand privilégier le Cloud, et pourquoi.",
      "en": "Cette question revient souvent lorsqu’on doit déployer une application, un site web ou une API. Pourtant, le meilleur choix ne dépend pas uniquement du prix ou du fait que « le cloud est plus moderne et plus flexible ».\n\nDans cette session, nous allons comparer concrètement les deux approches et surtout comprendre quand choisir un VPS, quand privilégier le Cloud, et pourquoi."
    },
    "track": {
      "fr": "Cloud",
      "en": "Cloud"
    },
    "tags": [
      {
        "fr": "Cloud",
        "en": "Cloud"
      },
      {
        "fr": "Web",
        "en": "Web"
      },
      {
        "fr": "DevOps",
        "en": "DevOps"
      }
    ],
    "speakerIds": [
      "emerson-folong"
    ]
  },
  {
    "id": "sz-1354849",
    "day": 1,
    "kind": "talk",
    "lightning": true,
    "level": "introductory",
    "language": [
      "fr"
    ],
    "originalLanguage": "fr",
    "title": {
      "fr": "AI & Language: Will AI Replace Translators? Rethinking Language Careers in the Age of Generative AI",
      "en": "AI & Language: Will AI Replace Translators? Rethinking Language Careers in the Age of Generative AI"
    },
    "description": {
      "fr": "L’intelligence artificielle générative transforme rapidement les métiers fondés sur le langage. Aujourd’hui, une IA peut traduire un document en quelques secondes, reformuler un texte, proposer plusieurs variantes stylistiques ou encore produire du contenu dans plusieurs langues. Face à ces avancées, une question revient souvent : l’IA va-t-elle remplacer les traducteurs ?\n\nCette session propose de dépasser cette vision binaire pour examiner la manière dont l’intelligence artificielle redéfinit concrètement les métiers de la traduction, de la communication et de la production de contenu.\n\nÀ travers des démonstrations pratiques et une analyse comparative de traductions générées par l’IA et de versions professionnelles, la session montrera les capacités actuelles des outils d’IA générative, mais aussi leurs limites : contexte, terminologie, registre, culture, cohérence institutionnelle et jugement professionnel.\n\nL’objectif sera surtout d’identifier les nouvelles compétences qui émergent : prompt engineering, post-édition, contrôle qualité, contextualisation, supervision des systèmes d’IA et gestion des données linguistiques.\n\nEnfin, la session ouvrira une réflexion sur l’avenir des langues dans l’écosystème numérique africain : qui apprend à l’IA à comprendre nos langues, nos cultures et nos réalités ?\n\nL’enjeu n’est donc plus simplement de savoir si l’IA remplacera les traducteurs, mais de comprendre comment les professionnels des langues peuvent devenir plus performants grâce à l’IA et créer de nouvelles opportunités professionnelles autour d’elle.",
      "en": "L’intelligence artificielle générative transforme rapidement les métiers fondés sur le langage. Aujourd’hui, une IA peut traduire un document en quelques secondes, reformuler un texte, proposer plusieurs variantes stylistiques ou encore produire du contenu dans plusieurs langues. Face à ces avancées, une question revient souvent : l’IA va-t-elle remplacer les traducteurs ?\n\nCette session propose de dépasser cette vision binaire pour examiner la manière dont l’intelligence artificielle redéfinit concrètement les métiers de la traduction, de la communication et de la production de contenu.\n\nÀ travers des démonstrations pratiques et une analyse comparative de traductions générées par l’IA et de versions professionnelles, la session montrera les capacités actuelles des outils d’IA générative, mais aussi leurs limites : contexte, terminologie, registre, culture, cohérence institutionnelle et jugement professionnel.\n\nL’objectif sera surtout d’identifier les nouvelles compétences qui émergent : prompt engineering, post-édition, contrôle qualité, contextualisation, supervision des systèmes d’IA et gestion des données linguistiques.\n\nEnfin, la session ouvrira une réflexion sur l’avenir des langues dans l’écosystème numérique africain : qui apprend à l’IA à comprendre nos langues, nos cultures et nos réalités ?\n\nL’enjeu n’est donc plus simplement de savoir si l’IA remplacera les traducteurs, mais de comprendre comment les professionnels des langues peuvent devenir plus performants grâce à l’IA et créer de nouvelles opportunités professionnelles autour d’elle."
    },
    "track": {
      "fr": "IA & ML",
      "en": "AI & ML"
    },
    "tags": [
      {
        "fr": "IA",
        "en": "AI"
      },
      {
        "fr": "Communication",
        "en": "Communication"
      }
    ],
    "speakerIds": [
      "manuel-karim-abolo"
    ]
  },
  {
    "id": "sz-1355263",
    "day": 1,
    "kind": "talk",
    "lightning": true,
    "level": "intermediate",
    "language": [
      "fr"
    ],
    "originalLanguage": "fr",
    "title": {
      "fr": "NotebookLM : l’IA Google qui comprend les documents pour vos révisions, recherches et mémoires",
      "en": "NotebookLM : l’IA Google qui comprend les documents pour vos révisions, recherches et mémoires"
    },
    "description": {
      "fr": "ChatGPT hallucine. Gemini généralise. NotebookLM, lui, ne parle qu’à partir de ce que vous lui donnez.\n\nDans cette session, on plonge dans ce qui rend NotebookLM unique et redoutablement utile pour les étudiants africains :\n\nRévisions intelligentes : importe tes cours, génère des résumés, des quiz, des plans en quelques secondes\nRecherche académique : charge tes articles scientifiques, interroge-les comme un expert, extrait les citations clés sans te noyer dans 80 pages\nRédaction de mémoire : organise tes sources, détecte les contradictions entre auteurs, construis ta problématique avec l’IA comme co-pilote\nPourquoi NotebookLM et pas ChatGPT ? : comparaison honnête sur le terrain — fiabilité des sources, ancrage documentaire, confidentialité, accès gratuit\n\nPas de code. Pas de prompt engineering. Juste tes fichiers et une méthode. Une session concrète pour les étudiants qui veulent travailler plus intelligemment, pas plus longtemps.",
      "en": "ChatGPT hallucine. Gemini généralise. NotebookLM, lui, ne parle qu’à partir de ce que vous lui donnez.\n\nDans cette session, on plonge dans ce qui rend NotebookLM unique et redoutablement utile pour les étudiants africains :\n\nRévisions intelligentes : importe tes cours, génère des résumés, des quiz, des plans en quelques secondes\nRecherche académique : charge tes articles scientifiques, interroge-les comme un expert, extrait les citations clés sans te noyer dans 80 pages\nRédaction de mémoire : organise tes sources, détecte les contradictions entre auteurs, construis ta problématique avec l’IA comme co-pilote\nPourquoi NotebookLM et pas ChatGPT ? : comparaison honnête sur le terrain — fiabilité des sources, ancrage documentaire, confidentialité, accès gratuit\n\nPas de code. Pas de prompt engineering. Juste tes fichiers et une méthode. Une session concrète pour les étudiants qui veulent travailler plus intelligemment, pas plus longtemps."
    },
    "track": {
      "fr": "IA & ML",
      "en": "AI & ML"
    },
    "tags": [
      {
        "fr": "IA & ML",
        "en": "AI & ML"
      }
    ],
    "speakerIds": [
      "gervais-azanga-ayissi"
    ]
  },
  {
    "id": "sz-1367658",
    "day": 1,
    "kind": "talk",
    "lightning": true,
    "level": "introductory",
    "language": [
      "fr",
      "en"
    ],
    "originalLanguage": "en",
    "title": {
      "fr": "AI and XR technologies in Health: Empowering Healthcare workers and Elevating Patients Care",
      "en": "AI and XR technologies in Health: Empowering Healthcare workers and Elevating Patients Care"
    },
    "description": {
      "fr": "The convergence of AI and XR technologies, including Virtual Reality (VR), Augmented Reality (AR), and Mixed Reality (MR), is creating new opportunities in medical education and healthcare delivery. However, challenges such as the high cost of medical training, limited access to specialized equipment, patient safety concerns, and unequal access to quality healthcare education remain significant barriers.\n\nThis session explores how AI and XR can help overcome these challenges by combining intelligent assistance with immersive, hands-on learning. AI enables personalized guidance and real-time performance feedback, while XR provides interactive, risk-free environments where healthcare students and professionals can practise clinical procedures, visualize complex anatomy, and strengthen their decision-making skills. Beyond training, these technologies also offer promising applications in patient education, rehabilitation, and clinical care.\n\nThe session will showcase Hakkilo XR’s work in developing AI-powered immersive learning solutions that enable learners to practise clinical skills, explore complex medical scenarios, and learn from mistakes without putting patients at risk. With a focus on African healthcare contexts, it will highlight how locally developed technologies can help address infrastructure constraints, expand access to medical training, strengthen healthcare professionals’ competencies, and ultimately contribute to safer clinical practice and better patient outcomes.",
      "en": "The convergence of AI and XR technologies, including Virtual Reality (VR), Augmented Reality (AR), and Mixed Reality (MR), is creating new opportunities in medical education and healthcare delivery. However, challenges such as the high cost of medical training, limited access to specialized equipment, patient safety concerns, and unequal access to quality healthcare education remain significant barriers.\n\nThis session explores how AI and XR can help overcome these challenges by combining intelligent assistance with immersive, hands-on learning. AI enables personalized guidance and real-time performance feedback, while XR provides interactive, risk-free environments where healthcare students and professionals can practise clinical procedures, visualize complex anatomy, and strengthen their decision-making skills. Beyond training, these technologies also offer promising applications in patient education, rehabilitation, and clinical care.\n\nThe session will showcase Hakkilo XR’s work in developing AI-powered immersive learning solutions that enable learners to practise clinical skills, explore complex medical scenarios, and learn from mistakes without putting patients at risk. With a focus on African healthcare contexts, it will highlight how locally developed technologies can help address infrastructure constraints, expand access to medical training, strengthen healthcare professionals’ competencies, and ultimately contribute to safer clinical practice and better patient outcomes."
    },
    "track": {
      "fr": "IA & ML",
      "en": "AI & ML"
    },
    "tags": [
      {
        "fr": "IA",
        "en": "AI"
      }
    ],
    "speakerIds": [
      "destin-kouam"
    ]
  },
  {
    "id": "sz-1368723",
    "day": 1,
    "kind": "talk",
    "lightning": true,
    "level": "expert",
    "language": [
      "fr"
    ],
    "originalLanguage": "fr",
    "title": {
      "fr": "Comment améliorer son employabilité dans le domaine de la tech?",
      "en": "Comment améliorer son employabilité dans le domaine de la tech?"
    },
    "description": {
      "fr": "Il s'agira au travers de partages d'expériences, démontrer qu'en termes d'employabilité dans la tech, les compétences techniques seules ne suffisent pas et que les questions liées à la définition de ses objectifs de carrière, au mindset, le savoir être, la posture professionnelle, la confiance en soi, la préparation de son CV/entretiens d'embauche, le réseautage professionnel sont tout aussi importantes.",
      "en": "Il s'agira au travers de partages d'expériences, démontrer qu'en termes d'employabilité dans la tech, les compétences techniques seules ne suffisent pas et que les questions liées à la définition de ses objectifs de carrière, au mindset, le savoir être, la posture professionnelle, la confiance en soi, la préparation de son CV/entretiens d'embauche, le réseautage professionnel sont tout aussi importantes."
    },
    "track": {
      "fr": "Business",
      "en": "Business"
    },
    "tags": [
      {
        "fr": "Business",
        "en": "Business"
      }
    ],
    "speakerIds": [
      "arnaud-dzudie"
    ]
  },
  {
    "id": "sz-1369967",
    "day": 1,
    "kind": "talk",
    "lightning": true,
    "level": "introductory",
    "language": [
      "fr"
    ],
    "originalLanguage": "fr",
    "title": {
      "fr": "Automatiser une tâche répétitive avec un agent IA simple",
      "en": "Automatiser une tâche répétitive avec un agent IA simple"
    },
    "description": {
      "fr": "Dans ce lightning talk, je montrerai comment partir d’un processus répétitif du quotidien pour construire un workflow intelligent simple, sans chercher à tout maîtriser dès le départ. À travers l’exemple de demandes reçues via un formulaire, le public verra comment collecter les informations, les transmettre à un modèle d’IA pour les résumer ou les classer, puis préparer une réponse à faire valider par un humain. La session expliquera pas à pas la logique du workflow avec un outil comme Make, les choix à faire, les points de vigilance et les limites de l’automatisation. Le public repartira avec une méthode concrète : identifier un problème réel, découper le processus, choisir les bons outils, tester progressivement et garder une validation humaine pour les actions importantes.",
      "en": "Dans ce lightning talk, je montrerai comment partir d’un processus répétitif du quotidien pour construire un workflow intelligent simple, sans chercher à tout maîtriser dès le départ. À travers l’exemple de demandes reçues via un formulaire, le public verra comment collecter les informations, les transmettre à un modèle d’IA pour les résumer ou les classer, puis préparer une réponse à faire valider par un humain. La session expliquera pas à pas la logique du workflow avec un outil comme Make, les choix à faire, les points de vigilance et les limites de l’automatisation. Le public repartira avec une méthode concrète : identifier un problème réel, découper le processus, choisir les bons outils, tester progressivement et garder une validation humaine pour les actions importantes."
    },
    "track": {
      "fr": "IA & ML",
      "en": "AI & ML"
    },
    "tags": [
      {
        "fr": "IA & ML",
        "en": "AI & ML"
      }
    ],
    "speakerIds": [
      "anita-dongmo"
    ]
  },
  {
    "id": "sz-1371401",
    "day": 1,
    "kind": "talk",
    "lightning": true,
    "level": "intermediate",
    "language": [
      "fr"
    ],
    "originalLanguage": "fr",
    "title": {
      "fr": "Cloud et cybersécurité : l’IA comme copilote de vigilance",
      "en": "Cloud et cybersécurité : l’IA comme copilote de vigilance"
    },
    "description": {
      "fr": "Durant cette session, je partagerai mon regard d’étudiante en réseaux et télécommunications sur un sujet qui évolue vite : la rencontre entre cloud, cybersécurité et intelligence artificielle. À partir de mon experience personnelle, j'essaierai de faire comprendre pourquoi le cloud change la manière de protéger les systèmes, et comment l’IA peut déjà aider à repérer des risques, analyser des alertes, résumer des journaux ou guider les premières vérifications.",
      "en": "Durant cette session, je partagerai mon regard d’étudiante en réseaux et télécommunications sur un sujet qui évolue vite : la rencontre entre cloud, cybersécurité et intelligence artificielle. À partir de mon experience personnelle, j'essaierai de faire comprendre pourquoi le cloud change la manière de protéger les systèmes, et comment l’IA peut déjà aider à repérer des risques, analyser des alertes, résumer des journaux ou guider les premières vérifications."
    },
    "track": {
      "fr": "Cloud",
      "en": "Cloud"
    },
    "tags": [
      {
        "fr": "Cloud",
        "en": "Cloud"
      },
      {
        "fr": "Cybersécurité",
        "en": "Cybersecurity"
      },
      {
        "fr": "IA",
        "en": "AI"
      }
    ],
    "speakerIds": [
      "sandra-macheu-talla"
    ]
  },
  {
    "id": "sz-1371405",
    "day": 1,
    "kind": "talk",
    "lightning": true,
    "level": "introductory",
    "language": [
      "fr"
    ],
    "originalLanguage": "fr",
    "title": {
      "fr": "Automatiser ses vérifications réseau avec un assistant IA",
      "en": "Automatiser ses vérifications réseau avec un assistant IA"
    },
    "description": {
      "fr": "Cette session présente une méthode progressive pour automatiser les vérifications réseau à l’aide de scripts, d’outils adaptés et d’un assistant IA, afin de simplifier les contrôles répétitifs, faciliter leur utilisation en langage naturel et garder l’humain au centre de la décision réseau.",
      "en": "Cette session présente une méthode progressive pour automatiser les vérifications réseau à l’aide de scripts, d’outils adaptés et d’un assistant IA, afin de simplifier les contrôles répétitifs, faciliter leur utilisation en langage naturel et garder l’humain au centre de la décision réseau."
    },
    "track": {
      "fr": "IA & ML",
      "en": "AI & ML"
    },
    "tags": [
      {
        "fr": "IA",
        "en": "AI"
      }
    ],
    "speakerIds": [
      "verdiane-fotso"
    ]
  },
  {
    "id": "sz-1371413",
    "day": 1,
    "kind": "talk",
    "lightning": true,
    "level": "intermediate",
    "language": [
      "fr"
    ],
    "originalLanguage": "fr",
    "title": {
      "fr": "Construire son premier réseau d’entreprise en laboratoire Ubuntu",
      "en": "Construire son premier réseau d’entreprise en laboratoire Ubuntu"
    },
    "description": {
      "fr": "Dans cette session pensée pour les débutant·es, nous allons construire un petit réseau d’entreprise en laboratoire avec Ubuntu. Le public verra comment les briques essentielles se connectent entre elles : attribuer des adresses avec DHCP, résoudre des noms avec DNS, accéder à une machine avec SSH, publier une page web et comprendre les bases d’un service de messagerie. L’objectif n’est pas de tout maîtriser en profondeur, mais de rendre visibles les mécanismes qui font fonctionner un réseau au quotidien.\nÀ travers une démonstration progressive et des commandes simples, les participant·es comprendront le rôle de chaque service, les erreurs fréquentes à surveiller et une méthode pour tester que tout fonctionne. Ils repartiront avec une vision claire d’un mini-réseau d’entreprise, un plan de lab reproductible sur Ubuntu et la confiance nécessaire pour continuer à pratiquer.",
      "en": "Dans cette session pensée pour les débutant·es, nous allons construire un petit réseau d’entreprise en laboratoire avec Ubuntu. Le public verra comment les briques essentielles se connectent entre elles : attribuer des adresses avec DHCP, résoudre des noms avec DNS, accéder à une machine avec SSH, publier une page web et comprendre les bases d’un service de messagerie. L’objectif n’est pas de tout maîtriser en profondeur, mais de rendre visibles les mécanismes qui font fonctionner un réseau au quotidien.\nÀ travers une démonstration progressive et des commandes simples, les participant·es comprendront le rôle de chaque service, les erreurs fréquentes à surveiller et une méthode pour tester que tout fonctionne. Ils repartiront avec une vision claire d’un mini-réseau d’entreprise, un plan de lab reproductible sur Ubuntu et la confiance nécessaire pour continuer à pratiquer."
    },
    "track": {
      "fr": "DevOps",
      "en": "DevOps"
    },
    "tags": [
      {
        "fr": "DevOps",
        "en": "DevOps"
      },
      {
        "fr": "Cybersécurité",
        "en": "Cybersecurity"
      },
      {
        "fr": "Gemini",
        "en": "Gemini"
      }
    ],
    "speakerIds": [
      "ange-naomy-kengne-takoumbo"
    ]
  },
  {
    "id": "sz-1372363",
    "day": 1,
    "kind": "talk",
    "lightning": true,
    "level": "intermediate",
    "language": [
      "fr",
      "en"
    ],
    "originalLanguage": "fr",
    "title": {
      "fr": "From Beginner to Builder: Getting Started with Google Workspace",
      "en": "From Beginner to Builder: Getting Started with Google Workspace"
    },
    "description": {
      "fr": "Google Workspace est bien plus qu'une suite d'outils bureautiques : c'est un écosystème qui permet de collaborer, d'automatiser des tâches et de créer des solutions numériques.\n\nCette session propose un parcours concret pour découvrir comment tirer parti de Gmail, Google Drive, Docs et Sheets, organiser efficacement son environnement de travail, puis explorer les possibilités d'automatisation avec Google Apps Script et de création d'applications avec AppSheet.\n\nÀ travers des exemples pratiques et une feuille de route accessible aux débutants, les participants découvriront les compétences à acquérir, les ressources pour progresser et les premières étapes pour passer du simple utilisateur à un créateur de solutions avec Google Workspace.\n\nAucune expertise préalable en développement n'est nécessaire.",
      "en": "Google Workspace est bien plus qu'une suite d'outils bureautiques : c'est un écosystème qui permet de collaborer, d'automatiser des tâches et de créer des solutions numériques.\n\nCette session propose un parcours concret pour découvrir comment tirer parti de Gmail, Google Drive, Docs et Sheets, organiser efficacement son environnement de travail, puis explorer les possibilités d'automatisation avec Google Apps Script et de création d'applications avec AppSheet.\n\nÀ travers des exemples pratiques et une feuille de route accessible aux débutants, les participants découvriront les compétences à acquérir, les ressources pour progresser et les premières étapes pour passer du simple utilisateur à un créateur de solutions avec Google Workspace.\n\nAucune expertise préalable en développement n'est nécessaire."
    },
    "track": {
      "fr": "Web",
      "en": "Web"
    },
    "tags": [
      {
        "fr": "Web",
        "en": "Web"
      },
      {
        "fr": "Business",
        "en": "Business"
      },
      {
        "fr": "Science des données",
        "en": "Data Science"
      }
    ],
    "speakerIds": [
      "nathan-foka"
    ]
  },
  {
    "id": "sz-1372444",
    "day": 1,
    "kind": "talk",
    "lightning": true,
    "online": true,
    "level": "introductory",
    "language": [
      "fr"
    ],
    "originalLanguage": "fr",
    "title": {
      "fr": "Les 5 erreurs de sécurité Cloud que même les experts commettent",
      "en": "Les 5 erreurs de sécurité Cloud que même les experts commettent"
    },
    "description": {
      "fr": "Votre application fonctionne, vos tests passent et votre déploiement est réussi. Mais votre infrastructure Cloud est-elle vraiment sécurisée ?\n\nParfois, une simple configuration suffit à mettre en danger toute une infrastructure.\n\nDans ce lightning talk, nous découvrirons 5 erreurs de sécurité Cloud fréquentes, que même les personnes expérimentées peuvent commettre.\n\nÀ travers des exemples concrets, nous verrons comment identifier ces erreurs et surtout comment les éviter grâce à quelques bonnes pratiques simples.\n\nL'objectif ? Repartir avec 5 réflexes de sécurité à appliquer dès votre prochain commit.\n\nPas besoin d'être expert en cybersécurité. Le talk s'adresse à tous ceux qui développent, déploient ou exploitent des applications sur Google Cloud.",
      "en": "Votre application fonctionne, vos tests passent et votre déploiement est réussi. Mais votre infrastructure Cloud est-elle vraiment sécurisée ?\n\nParfois, une simple configuration suffit à mettre en danger toute une infrastructure.\n\nDans ce lightning talk, nous découvrirons 5 erreurs de sécurité Cloud fréquentes, que même les personnes expérimentées peuvent commettre.\n\nÀ travers des exemples concrets, nous verrons comment identifier ces erreurs et surtout comment les éviter grâce à quelques bonnes pratiques simples.\n\nL'objectif ? Repartir avec 5 réflexes de sécurité à appliquer dès votre prochain commit.\n\nPas besoin d'être expert en cybersécurité. Le talk s'adresse à tous ceux qui développent, déploient ou exploitent des applications sur Google Cloud."
    },
    "track": {
      "fr": "Cloud",
      "en": "Cloud"
    },
    "tags": [
      {
        "fr": "Cloud",
        "en": "Cloud"
      },
      {
        "fr": "Cybersécurité",
        "en": "Cybersecurity"
      },
      {
        "fr": "DevOps",
        "en": "DevOps"
      }
    ],
    "speakerIds": [
      "hubert-nang"
    ]
  },
  {
    "id": "sz-1372498",
    "day": 1,
    "kind": "talk",
    "lightning": true,
    "level": "advanced",
    "language": [
      "fr"
    ],
    "originalLanguage": "en",
    "title": {
      "fr": "Securing Enterprise AI: Managing Prompt Injection and AI Application Risks",
      "en": "Securing Enterprise AI: Managing Prompt Injection and AI Application Risks"
    },
    "description": {
      "fr": "As organizations increasingly adopt generative AI to improve productivity, automate processes, and enhance customer experiences, new security risks are emerging. Prompt injection, sensitive data exposure, and the misuse of AI-powered applications can create significant operational, security, and business risks.\n\nThis session explores how organizations can identify and manage these risks while enabling secure AI adoption. We will examine realistic prompt injection scenarios, discuss their potential business impact, and demonstrate how Google Cloud Model Armor can contribute to protecting AI applications as part of a defense-in-depth strategy.\n\nBeyond technical safeguards, the session will highlight practical security and governance principles that cybersecurity leaders, IT teams, and developers can apply to build more resilient AI-enabled solutions.\n\nAttendees will leave with actionable insights to strengthen AI application security, reduce exposure to emerging threats, and support responsible AI adoption within their organizations.",
      "en": "As organizations increasingly adopt generative AI to improve productivity, automate processes, and enhance customer experiences, new security risks are emerging. Prompt injection, sensitive data exposure, and the misuse of AI-powered applications can create significant operational, security, and business risks.\n\nThis session explores how organizations can identify and manage these risks while enabling secure AI adoption. We will examine realistic prompt injection scenarios, discuss their potential business impact, and demonstrate how Google Cloud Model Armor can contribute to protecting AI applications as part of a defense-in-depth strategy.\n\nBeyond technical safeguards, the session will highlight practical security and governance principles that cybersecurity leaders, IT teams, and developers can apply to build more resilient AI-enabled solutions.\n\nAttendees will leave with actionable insights to strengthen AI application security, reduce exposure to emerging threats, and support responsible AI adoption within their organizations."
    },
    "track": {
      "fr": "Cybersécurité",
      "en": "Cybersecurity"
    },
    "tags": [
      {
        "fr": "Cybersécurité",
        "en": "Cybersecurity"
      },
      {
        "fr": "IA & ML",
        "en": "AI & ML"
      }
    ],
    "speakerIds": [
      "le-prince-dachi"
    ]
  },
  {
    "id": "sz-1373948",
    "day": 1,
    "kind": "workshop",
    "level": "intermediate",
    "language": [
      "fr"
    ],
    "originalLanguage": "en",
    "title": {
      "fr": "How Many Ice Creams Should I Make Tomorrow?",
      "en": "How Many Ice Creams Should I Make Tomorrow?"
    },
    "description": {
      "fr": "Every morning, Bruno, an ice cream seller, has the same problem: how many tubs should he take out of the freezer? Too few and he turns customers away, too many and he throws ice cream away. In this talk, I’ll show how four summers of sales in a simple notebook can replace his gut feeling with real forecasts.",
      "en": "Every morning, Bruno, an ice cream seller, has the same problem: how many tubs should he take out of the freezer? Too few and he turns customers away, too many and he throws ice cream away. In this talk, I’ll show how four summers of sales in a simple notebook can replace his gut feeling with real forecasts."
    },
    "track": {
      "fr": "IA & ML",
      "en": "AI & ML"
    },
    "tags": [
      {
        "fr": "IA & ML",
        "en": "AI & ML"
      }
    ],
    "speakerIds": [
      "marie-ipouk"
    ]
  },
  {
    "id": "sz-1376249",
    "day": 1,
    "kind": "talk",
    "lightning": true,
    "level": "intermediate",
    "language": [
      "fr"
    ],
    "originalLanguage": "fr",
    "title": {
      "fr": "De l'idée à l'agent : Construire son premier agent IA avec Gemini et Firebase",
      "en": "De l'idée à l'agent : Construire son premier agent IA avec Gemini et Firebase"
    },
    "description": {
      "fr": "Les agents IA ne sont pas réservés aux experts. Ce talk montre, étape par étape et sans jargon inutile, comment un étudiant ou une personne non-technique peut assembler un agent fonctionnel avec uniquement les outils gratuits de Google.\n\nOn ne code pas en direct. On regarde ensemble quoi utiliser et comment s'y prendre : ouvrir AI Studio pour la clé Gemini, configurer la console Firebase, activer Firestore et Auth, écrire la logique de l'agent dans une fonction Cloud, brancher une interface avec le SDK, et déployer sur Hosting.\n\nL'agent « Assistant Campus » sert de fil conducteur : un assistant simple qui consulte un plan de cours, trouve un email, et rédige un brouillon. Le but n'est pas de le reproduire à l'identique, mais de comprendre la méthode pour construire le vôtre.",
      "en": "Les agents IA ne sont pas réservés aux experts. Ce talk montre, étape par étape et sans jargon inutile, comment un étudiant ou une personne non-technique peut assembler un agent fonctionnel avec uniquement les outils gratuits de Google.\n\nOn ne code pas en direct. On regarde ensemble quoi utiliser et comment s'y prendre : ouvrir AI Studio pour la clé Gemini, configurer la console Firebase, activer Firestore et Auth, écrire la logique de l'agent dans une fonction Cloud, brancher une interface avec le SDK, et déployer sur Hosting.\n\nL'agent « Assistant Campus » sert de fil conducteur : un assistant simple qui consulte un plan de cours, trouve un email, et rédige un brouillon. Le but n'est pas de le reproduire à l'identique, mais de comprendre la méthode pour construire le vôtre."
    },
    "track": {
      "fr": "Cloud",
      "en": "Cloud"
    },
    "tags": [
      {
        "fr": "Cloud",
        "en": "Cloud"
      },
      {
        "fr": "IA",
        "en": "AI"
      },
      {
        "fr": "Gemini",
        "en": "Gemini"
      }
    ],
    "speakerIds": [
      "david-njome"
    ]
  },
  {
    "id": "sz-1376670",
    "day": 1,
    "kind": "workshop",
    "level": "introductory",
    "language": [
      "fr",
      "en"
    ],
    "originalLanguage": "en",
    "title": {
      "fr": "Build a Telegram Agent to Configure Ubuntu Servers",
      "en": "Build a Telegram Agent to Configure Ubuntu Servers"
    },
    "description": {
      "fr": "Discover how to turn your instant messaging app into a true command center for your infrastructure. This hands-on workshop will guide you step by step through the creation of a Telegram bot capable of performing systems administration tasks securely.",
      "en": "Discover how to turn your instant messaging app into a true command center for your infrastructure. This hands-on workshop will guide you step by step through the creation of a Telegram bot capable of performing systems administration tasks securely."
    },
    "track": {
      "fr": "Cybersécurité",
      "en": "Cybersecurity"
    },
    "tags": [
      {
        "fr": "Cybersécurité",
        "en": "Cybersecurity"
      }
    ],
    "speakerIds": [
      "noemie-youbissi"
    ]
  },
  {
    "id": "sz-1376783",
    "day": 1,
    "kind": "talk",
    "lightning": true,
    "level": "introductory",
    "language": [
      "fr"
    ],
    "originalLanguage": "fr",
    "title": {
      "fr": "Du brief au code : automatiser son workflow web junior",
      "en": "Du brief au code : automatiser son workflow web junior"
    },
    "description": {
      "fr": "Dans cette session, je partage mon workflow de développeuse web junior, du moment où je reçois un brief jusqu’au passage au code. À partir de mon expérience d’étudiante en Génie Informatique et de projets sur lesquels j’ai travaillé, le public verra comment j’utilise l’IA comme assistant de réflexion, de structuration et de vérification, sans lui déléguer la compréhension du problème. Je raconterai aussi quelques erreurs de débutante : prompts trop vagues, confiance excessive dans une réponse, ou code copié sans assez tester. À travers un exemple concret, nous verrons comment transformer un besoin en tâches, poser de meilleures questions à l’IA, avancer étape par étape, puis relire et tester ce qui est produit. Le public repartira avec une méthode simple, réaliste et praticable pour apprendre plus vite, automatiser certaines étapes répétitives, et surtout progresser par la pratique.",
      "en": "Dans cette session, je partage mon workflow de développeuse web junior, du moment où je reçois un brief jusqu’au passage au code. À partir de mon expérience d’étudiante en Génie Informatique et de projets sur lesquels j’ai travaillé, le public verra comment j’utilise l’IA comme assistant de réflexion, de structuration et de vérification, sans lui déléguer la compréhension du problème. Je raconterai aussi quelques erreurs de débutante : prompts trop vagues, confiance excessive dans une réponse, ou code copié sans assez tester. À travers un exemple concret, nous verrons comment transformer un besoin en tâches, poser de meilleures questions à l’IA, avancer étape par étape, puis relire et tester ce qui est produit. Le public repartira avec une méthode simple, réaliste et praticable pour apprendre plus vite, automatiser certaines étapes répétitives, et surtout progresser par la pratique."
    },
    "track": {
      "fr": "Web",
      "en": "Web"
    },
    "tags": [
      {
        "fr": "Web",
        "en": "Web"
      },
      {
        "fr": "IA",
        "en": "AI"
      }
    ],
    "speakerIds": [
      "raissa-wokmeni"
    ]
  },
  {
    "id": "sz-1377020",
    "day": 1,
    "kind": "talk",
    "lightning": true,
    "level": "intermediate",
    "language": [
      "fr"
    ],
    "originalLanguage": "fr",
    "title": {
      "fr": "Développer avec l'intention : Maîtriser le Spec-Driven Development (SDD) avec GitHub Spec Kit",
      "en": "Développer avec l'intention : Maîtriser le Spec-Driven Development (SDD) avec GitHub Spec Kit"
    },
    "description": {
      "fr": "Le développement assisté par IA franchit une nouvelle étape avec l'approche Spec-Driven Development (SDD). Cette session explore le kit open-source GitHub Spec Kit pour structurer, planifier et exécuter des projets logiciels avec des agents de codage. Nous verrons comment transformer une idée en spécifications rigoureuses, générer des plans d'implémentation traçables via la CLI Specify, et automatiser le cycle de vie du code (de la constitution du projet au déploiement) tout en gardant un contrôle absolu sur la qualité architecturale.",
      "en": "Le développement assisté par IA franchit une nouvelle étape avec l'approche Spec-Driven Development (SDD). Cette session explore le kit open-source GitHub Spec Kit pour structurer, planifier et exécuter des projets logiciels avec des agents de codage. Nous verrons comment transformer une idée en spécifications rigoureuses, générer des plans d'implémentation traçables via la CLI Specify, et automatiser le cycle de vie du code (de la constitution du projet au déploiement) tout en gardant un contrôle absolu sur la qualité architecturale."
    },
    "track": {
      "fr": "IA & ML",
      "en": "AI & ML"
    },
    "tags": [
      {
        "fr": "IA",
        "en": "AI"
      },
      {
        "fr": "Gestion de produit",
        "en": "Product Management"
      },
      {
        "fr": "IA & ML",
        "en": "AI & ML"
      }
    ],
    "speakerIds": [
      "freddy-choudja"
    ]
  }
]$lineup$::jsonb, now(), null)
on conflict (id) do update
  set payload = excluded.payload,
      updated_at = excluded.updated_at,
      updated_by = excluded.updated_by;
