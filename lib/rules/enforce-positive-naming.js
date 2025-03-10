"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.enforcePositiveNaming = void 0;
const utils_1 = require("@typescript-eslint/utils");
const createRule_1 = require("../utils/createRule");
// Common negative prefixes for boolean variables
const BOOLEAN_NEGATIVE_PREFIXES = ['not', 'no', 'non', 'un', 'in', 'dis'];
const IN_EXCEPTIONS = [
    'in',
    'inane',
    'inaugural',
    'inaugurated',
    'inauguration',
    'inbound',
    'inbox',
    'incandescent',
    'incarcerated',
    'incarceration',
    'incarnation',
    'incendiary',
    'incense',
    'incentive',
    'incentives',
    'inception',
    'incest',
    'inch',
    'inches',
    'incidence',
    'incident',
    'incidental',
    'incidentally',
    'incidents',
    'incision',
    'incite',
    'inciting',
    'inclination',
    'incline',
    'inclined',
    'include',
    'included',
    'includes',
    'including',
    'inclusion',
    'inclusive',
    'income',
    'incomes',
    'incoming',
    'incorporate',
    'incorporated',
    'incorporates',
    'incorporating',
    'incorporation',
    'increase',
    'increased',
    'increases',
    'increasing',
    'increasingly',
    'incremental',
    'increments',
    'incriminating',
    'incubation',
    'incubator',
    'incumbent',
    'incumbents',
    'incur',
    'incurred',
    'indebted',
    'indeed',
    'index',
    'indexed',
    'indexes',
    'indexing',
    'indicate',
    'indicated',
    'indicates',
    'indicating',
    'indication',
    'indications',
    'indicative',
    'indicator',
    'indicators',
    'indices',
    'indicted',
    'indictment',
    'indictments',
    'indie',
    'indies',
    'indigenous',
    'indignation',
    'indigo',
    'indoor',
    'indoors',
    'induce',
    'induced',
    'induces',
    'inducing',
    'inducted',
    'induction',
    'indulge',
    'indulgence',
    'indulgent',
    'indulging',
    'industrial',
    'industrialized',
    'industries',
    'industry',
    'inexpensive',
    'infancy',
    'infant',
    'infantry',
    'infants',
    'infect',
    'infected',
    'infection',
    'infections',
    'infectious',
    'infer',
    'inference',
    'inferior',
    'inferno',
    'inferred',
    'infertility',
    'infestation',
    'infested',
    'infidelity',
    'infield',
    'infiltrate',
    'infiltrated',
    'infiltration',
    'infinite',
    'infinitely',
    'infinity',
    'infirmary',
    'inflamed',
    'inflammation',
    'inflammatory',
    'inflatable',
    'inflate',
    'inflated',
    'inflation',
    'inflict',
    'inflicted',
    'inflicting',
    'influence',
    'influenced',
    'influencers',
    'influences',
    'influencing',
    'influential',
    'influenza',
    'influx',
    'info',
    'infographic',
    'inform',
    'informant',
    'informants',
    'informatics',
    'information',
    'informational',
    'informative',
    'informed',
    'informing',
    'informs',
    'infrared',
    'infrastructure',
    'infringed',
    'infringement',
    'infringing',
    'infuriating',
    'infused',
    'infusion',
    'ingenious',
    'ingenuity',
    'ingested',
    'ingot',
    'ingrained',
    'ingredient',
    'ingredients',
    'inhabit',
    'inhabitants',
    'inhabited',
    'inhalation',
    'inhale',
    'inhaled',
    'inhaling',
    'inherent',
    'inherently',
    'inheritance',
    'inherited',
    'initial',
    'initially',
    'initials',
    'initiate',
    'initiated',
    'initiates',
    'initiating',
    'initiation',
    'initiative',
    'initiatives',
    'inject',
    'injected',
    'injecting',
    'injection',
    'injections',
    'injunction',
    'injure',
    'injured',
    'injuries',
    'injuring',
    'injury',
    'ink',
    'inked',
    'inks',
    'inland',
    'inlay',
    'inlet',
    'inmate',
    'inmates',
    'inn',
    'innate',
    'inner',
    'inning',
    'innings',
    'innovate',
    'innovation',
    'innovations',
    'innovative',
    'innovator',
    'innovators',
    'inns',
    'inpatient',
    'input',
    'inputs',
    'inquest',
    'inquire',
    'inquiries',
    'inquiry',
    'inquisition',
    'ins',
    'inscribed',
    'inscription',
    'inscriptions',
    'insect',
    'insects',
    'insert',
    'inserted',
    'inserting',
    'insertion',
    'inserts',
    'inside',
    'insider',
    'insiders',
    'insides',
    'insidious',
    'insight',
    'insightful',
    'insights',
    'insignia',
    'insist',
    'insisted',
    'insistence',
    'insistent',
    'insisting',
    'insists',
    'insofar',
    'inspect',
    'inspected',
    'inspecting',
    'inspection',
    'inspections',
    'inspector',
    'inspectors',
    'inspiration',
    'inspirational',
    'inspirations',
    'inspire',
    'inspired',
    'inspires',
    'inspiring',
    'install',
    'installation',
    'installations',
    'installed',
    'installing',
    'installment',
    'installments',
    'instalment',
    'instance',
    'instances',
    'instant',
    'instantaneous',
    'instantly',
    'instead',
    'instigated',
    'instinct',
    'instinctive',
    'instinctively',
    'instincts',
    'institute',
    'instituted',
    'institutes',
    'institution',
    'institutional',
    'institutions',
    'instruct',
    'instructed',
    'instructing',
    'instruction',
    'instructional',
    'instructions',
    'instructor',
    'instructors',
    'instrument',
    'instrumental',
    'instrumentation',
    'instruments',
    'insular',
    'insulated',
    'insulating',
    'insulation',
    'insulin',
    'insult',
    'insulted',
    'insulting',
    'insults',
    'insurance',
    'insure',
    'insured',
    'insurer',
    'insurers',
    'insurgency',
    'insurgent',
    'insurgents',
    'insurrection',
    'intake',
    'integers',
    'intel',
    'intellect',
    'intellectual',
    'intellectually',
    'intellectuals',
    'intelligence',
    'intelligent',
    'intelligently',
    'intend',
    'intended',
    'intending',
    'intends',
    'intense',
    'intensely',
    'intensified',
    'intensifies',
    'intensify',
    'intensity',
    'intensive',
    'intent',
    'intention',
    'intentional',
    'intentionally',
    'intentions',
    'inter',
    'interact',
    'interacted',
    'interacting',
    'interaction',
    'interactions',
    'interactive',
    'interacts',
    'intercept',
    'intercepted',
    'interception',
    'interceptions',
    'interchange',
    'interchangeable',
    'interconnected',
    'intercourse',
    'interest',
    'interested',
    'interesting',
    'interestingly',
    'interests',
    'interface',
    'interfaces',
    'interfere',
    'interfered',
    'interference',
    'interferes',
    'interfering',
    'interim',
    'interior',
    'interiors',
    'interlude',
    'intermediary',
    'intermediate',
    'intermission',
    'intermittent',
    'intermittently',
    'intern',
    'internal',
    'internally',
    'international',
    'internationally',
    'internationals',
    'interns',
    'internship',
    'internships',
    'interpersonal',
    'interplay',
    'interpret',
    'interpretation',
    'interpretations',
    'interpreted',
    'interpreter',
    'interpreters',
    'interpreting',
    'interpretive',
    'interracial',
    'interrogated',
    'interrogation',
    'interrupt',
    'interrupted',
    'interrupting',
    'interruption',
    'interruptions',
    'interrupts',
    'intersect',
    'intersection',
    'intersections',
    'interspersed',
    'interstate',
    'interstellar',
    'intertwined',
    'interval',
    'intervals',
    'intervene',
    'intervened',
    'intervening',
    'intervention',
    'interventions',
    'interview',
    'interviewed',
    'interviewer',
    'interviewing',
    'interviews',
    'intestinal',
    'intestine',
    'intestines',
    'intimacy',
    'intimate',
    'intimately',
    'intimidate',
    'intimidated',
    'intimidating',
    'intimidation',
    'into',
    'intoxicated',
    'intoxication',
    'intracellular',
    'intravenous',
    'intricate',
    'intrigue',
    'intrigued',
    'intriguing',
    'intrinsic',
    'intrinsically',
    'intro',
    'introduce',
    'introduced',
    'introduces',
    'introducing',
    'introduction',
    'introductions',
    'introductory',
    'intruder',
    'intruders',
    'intrusion',
    'intrusive',
    'intuition',
    'intuitive',
    'intuitively',
    'inundated',
    'invade',
    'invaded',
    'invaders',
    'invading',
    'invasion',
    'invasions',
    'invasive',
    'invent',
    'invented',
    'inventing',
    'invention',
    'inventions',
    'inventive',
    'inventor',
    'inventories',
    'inventors',
    'inventory',
    'inverness',
    'inverse',
    'inversion',
    'inverted',
    'invest',
    'invested',
    'investigate',
    'investigated',
    'investigates',
    'investigating',
    'investigation',
    'investigations',
    'investigative',
    'investigator',
    'investigators',
    'investing',
    'investment',
    'investments',
    'investor',
    'investors',
    'invests',
    'invitation',
    'invitational',
    'invitations',
    'invite',
    'invited',
    'invites',
    'inviting',
    'invoice',
    'invoices',
    'invoke',
    'invoked',
    'invoking',
    'involve',
    'involved',
    'involvement',
    'involves',
    'involving',
    'inward',
    'init',
    'initial',
    'initialization',
    'initialize',
    'initialized',
    'initializing',
    'initializes',
    'initializing',
    'initializes',
];
const NO_EXCEPTIONS = [
    'nobility',
    'noble',
    'nobleman',
    'nobles',
    'nobly',
    'nocturnal',
    'nod',
    'nodded',
    'nodding',
    'node',
    'nodes',
    'nods',
    'noel',
    'noir',
    'noise',
    'noises',
    'noisy',
    'nomad',
    'nomadic',
    'nomenclature',
    'nominal',
    'nominally',
    'nominate',
    'nominated',
    'nominating',
    'nomination',
    'nominations',
    'nominee',
    'nominees',
    'noodle',
    'noodles',
    'nook',
    'noon',
    'noose',
    'norM',
    'norma',
    'normal',
    'normalized',
    'normally',
    'normative',
    'norms',
    'north',
    'northbound',
    'northeast',
    'northeastern',
    'northern',
    'northward',
    'northwest',
    'northwestern',
    'nose',
    'nosey',
    'nostalgia',
    'nostalgic',
    'nostrils',
    'notable',
    'notably',
    'notary',
    'notation',
    'notch',
    'notched',
    'notebook',
    'notebooks',
    'noted',
    'notes',
    'noteworthy',
    'notice',
    'noticeable',
    'noticeably',
    'noticed',
    'notices',
    'noticing',
    'notification',
    'notifications',
    'notified',
    'notify',
    'notifying',
    'notion',
    'notions',
    'notoriety',
    'notorious',
    'notoriously',
    'noun',
    'nouns',
    'nourishment',
    'nouveau',
    'nova',
    'novel',
    'novelist',
    'novelists',
    'novella',
    'novels',
    'novelty',
    'novice',
    'now',
    'nowadays',
    'nozzle',
];
const UN_EXCEPTIONS = [
    'unanimous',
    'unanimously',
    'uncle',
    'uncles',
    'under',
    'underage',
    'undercover',
    'undercut',
    'underdog',
    'underestimate',
    'underestimated',
    'undergo',
    'undergoes',
    'undergoing',
    'undergone',
    'undergraduate',
    'undergraduates',
    'underground',
    'underlined',
    'underlying',
    'undermine',
    'undermined',
    'undermines',
    'undermining',
    'underneath',
    'underrated',
    'underside',
    'understand',
    'understandable',
    'understandably',
    'understanding',
    'understands',
    'understated',
    'understatement',
    'understood',
    'undertake',
    'undertaken',
    'undertaker',
    'undertaking',
    'undertook',
    'underwater',
    'underway',
    'underwear',
    'underwent',
    'underwood',
    'underworld',
    'underwriting',
    'unicorn',
    'unicorns',
    'unification',
    'unified',
    'uniform',
    'uniformed',
    'uniformity',
    'uniformly',
    'uniforms',
    'unify',
    'unifying',
    'unilateral',
    'unilaterally',
    'union',
    'unionist',
    'unionists',
    'unions',
    'unique',
    'uniquely',
    'uniqueness',
    'unison',
    'unit',
    'unitary',
    'unite',
    'united',
    'unites',
    'uniting',
    'units',
    'unity',
    'universal',
    'universally',
    'universe',
    'universes',
    'universities',
    'university',
    'unless',
    'until',
    'unto',
];
const DIS_EXCEPTIONS = [
    'disc',
    'disciple',
    'disciples',
    'disciplinary',
    'discipline',
    'disciplined',
    'disciplines',
    'disco',
    'discography',
    'discern',
    'discerning',
    'discourse',
    'discreet',
    'discreetly',
    'discrepancies',
    'discrepancy',
    'discrete',
    'discretion',
    'discretionary',
    'discriminate',
    'discriminated',
    'discriminating',
    'discrimination',
    'discriminatory',
    'discs',
    'discuss',
    'discussed',
    'discusses',
    'discussing',
    'discussion',
    'discussions',
    'disengage',
    'disparate',
    'dispensary',
    'dispense',
    'dispenser',
    'dispensing',
    'disperse',
    'dispersed',
    'dispersion',
    'disposition',
    'disseminate',
    'dissemination',
    'dissertation',
    'dissident',
    'dissidents',
    'dissimilar',
    'dissipated',
    'dissolution',
    'dissolve',
    'dissolved',
    'dissolving',
    'distal',
    'distance',
    'distances',
    'distancing',
    'distant',
    'distillation',
    'distilled',
    'distillery',
    'distinct',
    'distinction',
    'distinctions',
    'distinctive',
    'distinctly',
    'distinguish',
    'distinguished',
    'distinguishes',
    'distinguishing',
    'distort',
    'distorted',
    'distortion',
    'distortions',
    'distract',
    'distracted',
    'distracting',
    'distraction',
    'distractions',
    'distraught',
    'distribute',
    'distributed',
    'distributes',
    'distributing',
    'distribution',
    'distributions',
    'distributor',
    'distributors',
    'district',
    'districts',
    'dismal',
    'disaster',
    'disasters',
    'disastrous',
];
// Words that contain negative prefixes but should be treated as valid
const EXCEPTION_WORDS = [
    ...IN_EXCEPTIONS,
    ...NO_EXCEPTIONS,
    ...UN_EXCEPTIONS,
    ...DIS_EXCEPTIONS,
];
/**
 * Splits a variable name into individual words based on naming conventions:
 * - camelCase or PascalCase: split on uppercase letters
 * - SCREAMING_SNAKE_CASE: split on underscores
 * @param name Variable name to split
 * @returns Array of individual words in lowercase
 */
function splitNameIntoWords(name) {
    // Handle SCREAMING_SNAKE_CASE
    if (name.includes('_')) {
        return name.toLowerCase().split('_').filter(Boolean);
    }
    // Handle camelCase and PascalCase
    // Add space before uppercase letters and then split
    const spacedName = name.replace(/([A-Z])/g, ' $1');
    return spacedName.toLowerCase().trim().split(/\s+/).filter(Boolean);
}
// Map of negative boolean terms to suggested positive alternatives
const BOOLEAN_POSITIVE_ALTERNATIVES = {
    // Boolean prefixes - These will be removed from suggestions
    isNot: ['is'],
    isUn: ['is'],
    isDis: ['is'],
    isIn: ['is'],
    isNon: ['is'],
    hasNo: ['has'],
    hasNot: ['has'],
    canNot: ['can'],
    shouldNot: ['should'],
    willNot: ['will'],
    doesNot: ['does'],
    IsNot: ['Is'],
    IsUn: ['Is'],
    IsDis: ['Is'],
    IsIn: ['Is'],
    IsNon: ['Is'],
    HasNo: ['Has'],
    HasNot: ['Has'],
    CanNot: ['Can'],
    ShouldNot: ['Should'],
    WillNot: ['Will'],
    DoesNot: ['Does'],
    IS_NOT: ['IS'],
    IS_UN: ['IS'],
    IS_DIS: ['IS'],
    IS_IN: ['IS'],
    IS_NON: ['IS'],
    HAS_NO: ['HAS'],
    HAS_NOT: ['HAS'],
    CAN_NOT: ['CAN'],
    SHOULD_NOT: ['SHOULD'],
    WILL_NOT: ['WILL'],
    DOES_NOT: ['DOES'],
};
exports.enforcePositiveNaming = (0, createRule_1.createRule)({
    name: 'enforce-positive-naming',
    meta: {
        type: 'suggestion',
        docs: {
            description: 'Enforce positive naming for boolean variables and avoid negations',
            recommended: 'error',
        },
        schema: [],
        messages: {
            avoidNegativeNaming: 'Avoid negative naming "{{name}}". Consider using a positive alternative like: {{alternatives}}',
        },
    },
    defaultOptions: [],
    create(context) {
        // Get the filename from the context
        const filename = context.getFilename();
        // Skip checking for files that should be ignored
        // 1. Files that are not .ts or .tsx
        // 2. Files starting with .
        // 3. Files containing .config
        // 4. Files containing rc suffix
        if ((!filename.endsWith('.ts') && !filename.endsWith('.tsx')) ||
            filename.split('/').pop()?.startsWith('.') ||
            filename.includes('.config') ||
            filename.includes('rc.') ||
            filename.endsWith('rc')) {
            // Return empty object to skip all checks for this file
            return {};
        }
        /**
         * Check if a name has boolean negative naming
         */
        function hasBooleanNegativeNaming(name) {
            // Check for exact matches in our alternatives map first
            if (BOOLEAN_POSITIVE_ALTERNATIVES[name]) {
                return {
                    isNegative: true,
                    alternatives: BOOLEAN_POSITIVE_ALTERNATIVES[name],
                };
            }
            // Split the name into words
            const words = splitNameIntoWords(name);
            // Check if this follows the pattern IS_NOT_SOMETHING or HAS_NO_SOMETHING
            const secondWord = words[1].toLowerCase();
            if (EXCEPTION_WORDS.some((exception) => secondWord === exception.toLowerCase())) {
                return { isNegative: false, alternatives: [] };
            }
            const nameLowercase = name.toLowerCase();
            // Check for negative prefixes in boolean-like variables
            if (nameLowercase.startsWith('is') ||
                nameLowercase.startsWith('has') ||
                nameLowercase.startsWith('can') ||
                nameLowercase.startsWith('should') ||
                nameLowercase.startsWith('will') ||
                nameLowercase.startsWith('does')) {
                // We already checked exception words above, so no need to check again
                for (const prefix of BOOLEAN_NEGATIVE_PREFIXES) {
                    const prefixCapitalized = prefix.charAt(0).toUpperCase() + prefix.slice(1);
                    const prefixUppercase = prefix.toUpperCase();
                    // Check for patterns like isNot, hasNo, canNot, etc.
                    const prefixPatterns = [
                        {
                            pattern: new RegExp(`^is${prefixCapitalized}`, 'i'),
                            key: `is${prefixCapitalized}`,
                        },
                        {
                            pattern: new RegExp(`^has${prefixCapitalized}`, 'i'),
                            key: `has${prefixCapitalized}`,
                        },
                        {
                            pattern: new RegExp(`^can${prefixCapitalized}`, 'i'),
                            key: `can${prefixCapitalized}`,
                        },
                        {
                            pattern: new RegExp(`^should${prefixCapitalized}`, 'i'),
                            key: `should${prefixCapitalized}`,
                        },
                        {
                            pattern: new RegExp(`^will${prefixCapitalized}`, 'i'),
                            key: `will${prefixCapitalized}`,
                        },
                        {
                            pattern: new RegExp(`^does${prefixCapitalized}`, 'i'),
                            key: `does${prefixCapitalized}`,
                        },
                        {
                            pattern: new RegExp(`^Is${prefixCapitalized}`, 'i'),
                            key: `Is${prefixCapitalized}`,
                        },
                        {
                            pattern: new RegExp(`^Has${prefixCapitalized}`, 'i'),
                            key: `Has${prefixCapitalized}`,
                        },
                        {
                            pattern: new RegExp(`^Can${prefixCapitalized}`, 'i'),
                            key: `Can${prefixCapitalized}`,
                        },
                        {
                            pattern: new RegExp(`^Should${prefixCapitalized}`, 'i'),
                            key: `Should${prefixCapitalized}`,
                        },
                        {
                            pattern: new RegExp(`^Will${prefixCapitalized}`, 'i'),
                            key: `Will${prefixCapitalized}`,
                        },
                        {
                            pattern: new RegExp(`^Does${prefixCapitalized}`, 'i'),
                            key: `Does${prefixCapitalized}`,
                        },
                        {
                            pattern: new RegExp(`^IS_${prefixUppercase}`, 'i'),
                            key: `IS_${prefixUppercase}`,
                        },
                        {
                            pattern: new RegExp(`^HAS_${prefixUppercase}`, 'i'),
                            key: `HAS_${prefixUppercase}`,
                        },
                        {
                            pattern: new RegExp(`^CAN_${prefixUppercase}`, 'i'),
                            key: `CAN_${prefixUppercase}`,
                        },
                        {
                            pattern: new RegExp(`^SHOULD_${prefixUppercase}`, 'i'),
                            key: `SHOULD_${prefixUppercase}`,
                        },
                        {
                            pattern: new RegExp(`^WILL_${prefixUppercase}`, 'i'),
                            key: `WILL_${prefixUppercase}`,
                        },
                        {
                            pattern: new RegExp(`^DOES_${prefixUppercase}`, 'i'),
                            key: `DOES_${prefixUppercase}`,
                        },
                    ];
                    for (const { pattern, key } of prefixPatterns) {
                        if (pattern.test(name)) {
                            // If we have a direct match for this pattern (like isNotVerified -> isVerified)
                            const directMatch = BOOLEAN_POSITIVE_ALTERNATIVES[name];
                            if (directMatch) {
                                return { isNegative: true, alternatives: directMatch };
                            }
                            const alternatives = BOOLEAN_POSITIVE_ALTERNATIVES[key] || [];
                            if (alternatives.length > 0) {
                                // Suggest the positive version with the rest of the name
                                const restOfName = name.replace(pattern, '');
                                const suggestedAlternatives = alternatives.map((alt) => `${alt}${restOfName.charAt(0).toUpperCase() + restOfName.slice(1)}`);
                                return {
                                    isNegative: true,
                                    alternatives: suggestedAlternatives,
                                };
                            }
                            return {
                                isNegative: true,
                                alternatives: ['a positive alternative'],
                            };
                        }
                    }
                }
            }
            return { isNegative: false, alternatives: [] };
        }
        /**
         * Safely formats alternatives for display
         */
        function formatAlternatives(alternatives) {
            if (Array.isArray(alternatives)) {
                return alternatives.join(', ');
            }
            return String(alternatives);
        }
        /**
         * Check if a node is likely to be a boolean
         */
        function isBooleanLike(node) {
            // Check if the node has a boolean type annotation
            if (node.type === utils_1.AST_NODE_TYPES.TSTypeAnnotation &&
                node.typeAnnotation.type === utils_1.AST_NODE_TYPES.TSBooleanKeyword) {
                return true;
            }
            // Check if the node is initialized with a boolean literal
            if (node.parent?.type === utils_1.AST_NODE_TYPES.VariableDeclarator &&
                node.parent.init?.type === utils_1.AST_NODE_TYPES.Literal &&
                typeof node.parent.init.value === 'boolean') {
                return true;
            }
            // Check if the node has a name that suggests it's a boolean
            if (node.type === utils_1.AST_NODE_TYPES.Identifier &&
                (node.name.startsWith('is') ||
                    node.name.startsWith('has') ||
                    node.name.startsWith('can') ||
                    node.name.startsWith('should') ||
                    node.name.startsWith('will') ||
                    node.name.startsWith('does'))) {
                return true;
            }
            return false;
        }
        /**
         * Check variable declarations for negative naming
         */
        function checkVariableDeclaration(node) {
            if (node.id.type !== utils_1.AST_NODE_TYPES.Identifier)
                return;
            // Only check boolean-like variables
            if (!isBooleanLike(node.id) && !isBooleanLike(node))
                return;
            const variableName = node.id.name;
            const { isNegative, alternatives } = hasBooleanNegativeNaming(variableName);
            if (isNegative) {
                context.report({
                    node: node.id,
                    messageId: 'avoidNegativeNaming',
                    data: {
                        name: variableName,
                        alternatives: formatAlternatives(alternatives),
                    },
                });
            }
        }
        /**
         * Check function declarations for negative naming
         */
        function checkFunctionDeclaration(node) {
            // Skip anonymous functions
            if (!node.id && node.parent?.type !== utils_1.AST_NODE_TYPES.VariableDeclarator) {
                return;
            }
            // Get function name from either the function declaration or variable declarator
            let functionName = '';
            if (node.id) {
                functionName = node.id.name;
            }
            else if (node.parent?.type === utils_1.AST_NODE_TYPES.VariableDeclarator &&
                node.parent.id.type === utils_1.AST_NODE_TYPES.Identifier) {
                functionName = node.parent.id.name;
            }
            else if (node.parent?.type === utils_1.AST_NODE_TYPES.Property &&
                node.parent.key.type === utils_1.AST_NODE_TYPES.Identifier) {
                // Handle object method shorthand
                functionName = node.parent.key.name;
            }
            if (!functionName)
                return;
            // Only check boolean-returning functions
            if (!isBooleanLike(node.id || node))
                return;
            const { isNegative, alternatives } = hasBooleanNegativeNaming(functionName);
            if (isNegative) {
                context.report({
                    node: node.id || node,
                    messageId: 'avoidNegativeNaming',
                    data: {
                        name: functionName,
                        alternatives: formatAlternatives(alternatives),
                    },
                });
            }
        }
        /**
         * Check method definitions for negative naming
         */
        function checkMethodDefinition(node) {
            if (node.key.type !== utils_1.AST_NODE_TYPES.Identifier)
                return;
            // Only check boolean-returning methods
            if (!isBooleanLike(node.key))
                return;
            const methodName = node.key.name;
            const { isNegative, alternatives } = hasBooleanNegativeNaming(methodName);
            if (isNegative) {
                context.report({
                    node: node.key,
                    messageId: 'avoidNegativeNaming',
                    data: {
                        name: methodName,
                        alternatives: formatAlternatives(alternatives),
                    },
                });
            }
        }
        /**
         * Check property definitions for negative naming
         */
        function checkProperty(node) {
            if (node.key.type !== utils_1.AST_NODE_TYPES.Identifier)
                return;
            // Only check boolean properties
            if (!isBooleanLike(node.key))
                return;
            const propertyName = node.key.name;
            const { isNegative, alternatives } = hasBooleanNegativeNaming(propertyName);
            if (isNegative) {
                context.report({
                    node: node.key,
                    messageId: 'avoidNegativeNaming',
                    data: {
                        name: propertyName,
                        alternatives: formatAlternatives(alternatives),
                    },
                });
            }
        }
        /**
         * Check TSPropertySignature for negative naming (in interfaces)
         */
        function checkPropertySignature(node) {
            if (node.key.type !== utils_1.AST_NODE_TYPES.Identifier)
                return;
            // Only check boolean properties
            if (!isBooleanLike(node.key) &&
                !(node.typeAnnotation?.typeAnnotation.type ===
                    utils_1.AST_NODE_TYPES.TSBooleanKeyword))
                return;
            const propertyName = node.key.name;
            const { isNegative, alternatives } = hasBooleanNegativeNaming(propertyName);
            if (isNegative) {
                context.report({
                    node: node.key,
                    messageId: 'avoidNegativeNaming',
                    data: {
                        name: propertyName,
                        alternatives: formatAlternatives(alternatives),
                    },
                });
            }
        }
        /**
         * Check parameter names for negative naming
         */
        function checkParameter(node) {
            if (node.type !== utils_1.AST_NODE_TYPES.Identifier)
                return;
            // Only check boolean parameters
            if (!isBooleanLike(node))
                return;
            const paramName = node.name;
            const { isNegative, alternatives } = hasBooleanNegativeNaming(paramName);
            if (isNegative) {
                context.report({
                    node,
                    messageId: 'avoidNegativeNaming',
                    data: {
                        name: paramName,
                        alternatives: formatAlternatives(alternatives),
                    },
                });
            }
        }
        return {
            VariableDeclarator: checkVariableDeclaration,
            FunctionDeclaration: checkFunctionDeclaration,
            // Only check function expressions when they're not part of a variable declaration
            // to avoid duplicate errors
            FunctionExpression(node) {
                if (node.parent?.type !== utils_1.AST_NODE_TYPES.VariableDeclarator) {
                    checkFunctionDeclaration(node);
                }
            },
            // Only check arrow function expressions when they're not part of a variable declaration
            // to avoid duplicate errors
            ArrowFunctionExpression(node) {
                if (node.parent?.type !== utils_1.AST_NODE_TYPES.VariableDeclarator) {
                    checkFunctionDeclaration(node);
                }
            },
            MethodDefinition: checkMethodDefinition,
            Property: checkProperty,
            TSPropertySignature: checkPropertySignature,
            Identifier(node) {
                // Check parameter names in function declarations
                if (node.parent &&
                    (node.parent.type === utils_1.AST_NODE_TYPES.FunctionDeclaration ||
                        node.parent.type === utils_1.AST_NODE_TYPES.FunctionExpression ||
                        node.parent.type === utils_1.AST_NODE_TYPES.ArrowFunctionExpression) &&
                    node.parent.params.includes(node)) {
                    checkParameter(node);
                }
            },
        };
    },
});
//# sourceMappingURL=enforce-positive-naming.js.map