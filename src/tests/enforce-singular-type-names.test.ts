import { enforceSingularTypeNames } from '../rules/enforce-singular-type-names';
import { ruleTesterTs } from '../utils/ruleTester';

const messageTemplate =
  'Type name "{{name}}" appears to be plural, which might suggest a collection instead of a single instance. This rule is a suggestion and its pluralization heuristics may have false positives for irregular words or domain jargon. If "{{name}}" is intended to be plural or is a false positive, please use an // eslint-disable-next-line @blumintinc/blumint/enforce-singular-type-names comment. Otherwise, consider the singular form "{{suggestedName}}".';

const error = (name: string, suggestedName: string) => ({
  messageId: 'typeShouldBeSingular' as const,
  data: { name, suggestedName },
});

describe('enforce-singular-type-names message', () => {
  it('uses an educational template', () => {
    expect(enforceSingularTypeNames.meta.messages.typeShouldBeSingular).toBe(
      messageTemplate,
    );
  });
});

ruleTesterTs.run('enforce-singular-type-names', enforceSingularTypeNames, {
  valid: [
    // Singular type alias
    'type User = { id: number; name: string; };',

    // Singular interface
    'interface Person { id: number; name: string; }',

    // Singular enum
    'enum Color { RED, GREEN, BLUE }',

    // Already singular according to pluralize
    'type Analysis = { result: string; };',

    // Short names (less than 3 characters)
    'type ID = string;',
    'type IO = string;',
    'type UI = string;',

    // Union type with singular name
    'type Status = "pending" | "completed" | "failed";',

    // Generic type with singular name
    'type Result<T> = { data: T; error?: string; };',

    // Type with irregular plural that's already singular
    'type Sheep = { wool: boolean; };',
    'type Fish = { species: string; };',
    'type Deer = { antlers: boolean; };',

    // Types ending with 'Props' should be allowed even if plural
    'type ButtonProps = { onClick: () => void; };',
    'type UsersListProps = { users: User[]; };',
    'type ComponentProps = { children: React.ReactNode; };',
    'type FormProps = { onSubmit: () => void; };',
    'type TableProps = { rows: any[]; };',

    // Types ending with 'Params' should be allowed even if plural
    'type FetchDataParams = { id: string; };',
    'type UpdateUsersParams = { userIds: string[]; };',
    'type SearchParams = { query: string; };',
    'type ApiParams = { endpoint: string; };',
    'type QueryParams = { filters: any; };',

    // Types ending with 'Options' should be allowed
    'type ConfigOptions = { debug: boolean; };',
    'type BuildOptions = { minify: boolean; };',
    'type RequestOptions = { timeout: number; };',

    // Types ending with 'Settings' should be allowed
    'type UserSettings = { theme: string; };',
    'type AppSettings = { language: string; };',
    'type DatabaseSettings = { host: string; };',

    // Types ending with 'Data' should be allowed - Core test cases
    'type AuthenticationEnterPhonePageUserData = { phoneNumber: string; };',
    'type UserData = { name: string; age: number; };',
    'type FormData = { fields: any[]; };',
    'type ApiData = { response: any; };',
    'type ConfigData = { settings: any; };',
    'type MetaData = { title: string; description: string; };',
    'type ResponseData = { status: number; body: any; };',
    'type RequestData = { method: string; url: string; };',
    'type SessionData = { userId: string; token: string; };',
    'type CacheData = { key: string; value: any; };',

    // Specific test case from bug report
    'type AuthenticationEnterPhonePageUserData = { phoneNumber: string; /* other properties */ };',

    // Generic types with Data suffix
    'type ApiData<T> = { data: T; status: number; };',
    'type ResponseData<T, E = Error> = { data?: T; error?: E; };',
    'type CachedData<T> = { value: T; timestamp: number; };',

    // Interface with Data suffix
    'interface UserData { id: string; name: string; }',
    'interface FormData { fields: Record<string, any>; }',
    'interface ApiData<T> { data: T; meta: any; }',

    // Enum with Data suffix
    'enum ConfigData { DEVELOPMENT, PRODUCTION, TEST }',
    'enum MetaData { TITLE, DESCRIPTION, KEYWORDS }',

    // Union types with Data suffix
    'type StateData = "loading" | "success" | "error";',
    'type ThemeData = "light" | "dark" | "auto";',

    // Complex nested types with Data suffix
    'type NestedUserData = { profile: { personal: PersonalData; work: WorkData; }; };',
    'type ComplexApiData = { users: UserData[]; posts: PostData[]; comments: CommentData[]; };',

    // Very long type names with Data suffix
    'type VeryLongAuthenticationEnterPhonePageUserProfilePersonalInformationData = { phoneNumber: string; };',

    // Edge case: Just "Data"
    'type Data = any;',

    // Case sensitivity tests - Data suffix should work regardless of internal casing
    'type XMLData = { content: string; };',
    'type JSONData = { parsed: any; };',
    'type HTMLData = { markup: string; };',

    // Data in compound words
    'type DatabaseData = { records: any[]; };',
    'type FileSystemData = { files: string[]; };',
    'type NetworkData = { packets: any[]; };',

    // Mass nouns that are commonly used as singular in programming
    'type Information = { details: string; };',
    'type Software = { version: string; };',
    'type Hardware = { specs: any; };',
    'type Feedback = { rating: number; };',
    'type Research = { findings: any; };',
    'type Equipment = { items: any[]; };',
    'type Furniture = { pieces: any[]; };',

    // Technical terms that might be misidentified
    'type Analytics = { metrics: any; };',

    // Words that are both singular and plural
    'type Series = { episodes: any[]; };',
    'type Species = { characteristics: any; };',

    // Already singular words that might be confused
    'type Crisis = { severity: number; };',
    'type Thesis = { argument: string; };',

    // Compound words that should remain singular
    'type Workflow = { steps: any[]; };',
    'type Timestamp = { value: number; };',
    'type Namespace = { modules: any[]; };',
    'type Stylesheet = { rules: any[]; };',
    'type Framework = { components: any[]; };',

    // Technical abbreviations and acronyms
    'type API = { endpoints: any[]; };',
    'type URL = { path: string; };',
    'type UUID = { value: string; };',
    'type JSON = { data: any; };',
    'type XML = { content: string; };',
    'type HTML = { markup: string; };',
    'type CSS = { styles: any; };',
    'type SQL = { query: string; };',

    // Additional edge cases for Data suffix
    // Test case sensitivity - should all be treated as ending with "Data"
    'type TestData = { value: any; };',
    'type testData = { value: any; };', // lowercase (though not typical for types)
    'type TESTDATA = { value: any; };', // all caps (though not typical for types)

    // Test Data with different prefixes
    'type AData = { value: any; };',
    'type BData = { value: any; };',
    'type XYZData = { value: any; };',

    // Test compound words ending in Data
    'type BigData = { volume: number; };',
    'type SmallData = { size: number; };',
    'type RawData = { unprocessed: any; };',
    'type CleanData = { processed: any; };',
    'type DirtyData = { errors: any[]; };',

    // Test very short names ending in Data
    'type AData = { a: any; };',
    'type BData = { b: any; };',

    // Test names that contain "data" but don't end with it (should not be excluded)
    // These will be tested in invalid section if they're plural

    // Test edge case: exactly "Data"
    'type Data = { content: any; };',

    // Test Data with generic parameters
    'type Data<T> = { value: T; };',
    'type Data<T, U> = { first: T; second: U; };',

    // Test Data in different contexts
    'type ContextData = { context: any; };',
    'type StateData = { state: any; };',
    'type EventData = { event: any; };',
    'type ErrorData = { error: any; };',
    'type SuccessData = { success: any; };',

    // Test combinations with other excluded suffixes
    'type DataProps = { data: any; };', // Should be excluded for Props, not Data
    'type DataParams = { data: any; };', // Should be excluded for Params, not Data
    'type DataOptions = { data: any; };', // Should be excluded for Options, not Data
    'type DataSettings = { data: any; };', // Should be excluded for Settings, not Data

    // Test very long names ending in Data
    'type VeryVeryVeryLongTypeNameThatEndsWithData = { value: any; };',

    // Test names with numbers and Data
    'type Data1 = { value: any; };',
    'type Data2 = { value: any; };',
    'type Version1Data = { version: number; };',
    'type Config2Data = { config: any; };',

    // Test names with special characters (though not typical for TypeScript)
    // These are edge cases that might not be valid TypeScript but test the rule logic

    // Additional comprehensive tests for the Data suffix bug fix
    // These specifically test the original bug report scenario
    'type AuthenticationEnterPhonePageUserData = { phoneNumber: string; email?: string; };',
    'type LoginPageUserData = { username: string; password: string; };',
    'type RegistrationFormData = { firstName: string; lastName: string; };',
    'type PaymentProcessingData = { amount: number; currency: string; };',
    'type UserProfileData = { avatar: string; bio: string; };',
    'type ApplicationConfigData = { theme: string; locale: string; };',
    'type DatabaseConnectionData = { host: string; port: number; };',
    'type ApiResponseData = { status: number; message: string; };',
    'type FileUploadData = { filename: string; size: number; };',
    'type CacheStorageData = { key: string; value: any; ttl: number; };',

    // Test that mixed case variations of "data" are handled correctly
    'type TestDATA = { value: any; };',
    'type TestdAtA = { value: any; };',
    'type TestDaTa = { value: any; };',

    // Test edge cases with "data" in different positions
    'type DataContainer = { items: any[]; };', // starts with Data
    'type ContainerData = { items: any[]; };', // ends with Data
    'type DataProcessorData = { input: any; output: any; };', // both starts and ends with Data
  ],
  invalid: [
    // Basic plural type alias
    {
      code: 'type Users = { id: number; name: string; };',
      errors: [error('Users', 'User')],
    },

    // Plural interface
    {
      code: 'interface People { id: number; name: string; }',
      errors: [error('People', 'Person')],
    },

    // Plural enum
    {
      code: 'enum Colors { RED, GREEN, BLUE }',
      errors: [error('Colors', 'Color')],
    },

    // Plural union type
    {
      code: 'type Phases = "not-ready" | "ready";',
      errors: [error('Phases', 'Phase')],
    },

    // Plural generic type
    {
      code: 'type Results<T> = { data: T; error?: string; };',
      errors: [error('Results', 'Result')],
    },

    // Irregular plural
    {
      code: 'type Children = { name: string; age: number; };',
      errors: [error('Children', 'Child')],
    },

    // More plural types that should be flagged
    {
      code: 'type Books = { title: string; author: string; };',
      errors: [error('Books', 'Book')],
    },

    {
      code: 'type Cars = { make: string; model: string; };',
      errors: [error('Cars', 'Car')],
    },

    {
      code: 'type Houses = { address: string; rooms: number; };',
      errors: [error('Houses', 'House')],
    },

    // Plural interfaces
    {
      code: 'interface Students { name: string; grade: number; }',
      errors: [error('Students', 'Student')],
    },

    {
      code: 'interface Teachers { subject: string; experience: number; }',
      errors: [error('Teachers', 'Teacher')],
    },

    // Plural enums
    {
      code: 'enum Statuses { PENDING, APPROVED, REJECTED }',
      errors: [error('Statuses', 'Status')],
    },

    {
      code: 'enum Types { STRING, NUMBER, BOOLEAN }',
      errors: [error('Types', 'Type')],
    },

    // Irregular plurals
    {
      code: 'type Women = { name: string; age: number; };',
      errors: [error('Women', 'Woman')],
    },

    {
      code: 'type Men = { name: string; age: number; };',
      errors: [error('Men', 'Man')],
    },

    {
      code: 'type Feet = { size: number; };',
      errors: [error('Feet', 'Foot')],
    },

    {
      code: 'type Teeth = { count: number; };',
      errors: [error('Teeth', 'Tooth')],
    },

    {
      code: 'type Mice = { species: string; };',
      errors: [error('Mice', 'Mouse')],
    },

    // Generic plural types
    {
      code: 'type Items<T> = { data: T[]; count: number; };',
      errors: [error('Items', 'Item')],
    },

    {
      code: 'type Records<T, K> = { entries: T[]; keys: K[]; };',
      errors: [error('Records', 'Record')],
    },

    // Union types with plural names
    {
      code: 'type Animals = "cat" | "dog" | "bird";',
      errors: [error('Animals', 'Animal')],
    },

    {
      code: 'type Fruits = "apple" | "banana" | "orange";',
      errors: [error('Fruits', 'Fruit')],
    },

    // Complex plural types
    {
      code: 'type ApiResponses = { success: boolean; data: any; };',
      errors: [error('ApiResponses', 'ApiResponse')],
    },

    {
      code: 'type DatabaseRecords = { id: string; value: any; };',
      errors: [error('DatabaseRecords', 'DatabaseRecord')],
    },

    // Edge case: Types that contain "Data" but don't end with it should still be flagged if plural
    {
      code: 'type DataProcessors = { process: (data: any) => any; };',
      errors: [error('DataProcessors', 'DataProcessor')],
    },

    {
      code: 'type DataHandlers = { handle: (data: any) => void; };',
      errors: [error('DataHandlers', 'DataHandler')],
    },

    // Types that end with excluded suffixes but have plural words before them should still be flagged
    // Note: These should actually be valid based on the current rule implementation, but let's test edge cases

    // Long plural type names
    {
      code: 'type VeryLongComplexUserAccountManagementRecords = { id: string; };',
      errors: [
        error(
          'VeryLongComplexUserAccountManagementRecords',
          'VeryLongComplexUserAccountManagementRecord',
        ),
      ],
    },

    // Note: Types with numbers like Items2 are not flagged by pluralize library

    // Technical plural terms
    {
      code: 'type Algorithms = { name: string; complexity: string; };',
      errors: [error('Algorithms', 'Algorithm')],
    },

    {
      code: 'type Databases = { name: string; type: string; };',
      errors: [error('Databases', 'Database')],
    },

    {
      code: 'type Servers = { host: string; port: number; };',
      errors: [error('Servers', 'Server')],
    },

    // Plural types that might be confused with mass nouns but are clearly countable
    {
      code: 'type Softwares = { name: string; version: string; };',
      errors: [error('Softwares', 'Software')],
    },

    {
      code: 'type Hardwares = { type: string; specs: any; };',
      errors: [error('Hardwares', 'Hardware')],
    },

    // Edge cases: Types that contain "data" but don't end with "Data" should still be flagged if plural
    {
      code: 'type Databases = { name: string; host: string; };',
      errors: [error('Databases', 'Database')],
    },

    {
      code: 'type Metadatas = { key: string; value: any; };',
      errors: [error('Metadatas', 'Metadata')],
    },

    // Test that types containing "data" in the middle are still flagged if plural
    {
      code: 'type DataProcessors = { process: (data: any) => any; };',
      errors: [error('DataProcessors', 'DataProcessor')],
    },

    {
      code: 'type DataValidators = { validate: (data: any) => boolean; };',
      errors: [error('DataValidators', 'DataValidator')],
    },

    // Test plural types with "data" at the beginning
    {
      code: 'type DataSources = { url: string; type: string; };',
      errors: [error('DataSources', 'DataSource')],
    },

    {
      code: 'type DataTypes = { name: string; format: string; };',
      errors: [error('DataTypes', 'DataType')],
    },

    // Test that lowercase "data" doesn't get the exclusion (edge case)
    {
      code: 'type Datas = { content: any; };',
      errors: [error('Datas', 'Data')],
    },

    // Test compound words that are plural but don't end with excluded suffixes
    {
      code: 'type BigDatas = { volume: number; };',
      errors: [error('BigDatas', 'BigData')],
    },

    // Test technical terms that should be singular
    {
      code: 'type Frameworks = { name: string; version: string; };',
      errors: [error('Frameworks', 'Framework')],
    },

    {
      code: 'type Libraries = { name: string; dependencies: any[]; };',
      errors: [error('Libraries', 'Library')],
    },

    {
      code: 'type Modules = { exports: any; imports: any; };',
      errors: [error('Modules', 'Module')],
    },

    {
      code: 'type Components = { props: any; state: any; };',
      errors: [error('Components', 'Component')],
    },

    // Test plural forms of words that might be confused with mass nouns
    {
      code: 'type Informations = { details: string; };',
      errors: [error('Informations', 'Information')],
    },

    // Test edge cases with very short plural names (but longer than 3 chars)
    {
      code: 'type Apps = { name: string; };',
      errors: [error('Apps', 'App')],
    },

    {
      code: 'type Docs = { title: string; };',
      errors: [error('Docs', 'Doc')],
    },

    // Note: Types with numbers like Users2, Items3 are not flagged by pluralize library
    // Note: Types ending with Settings are excluded by the rule

    // Test that the rule still works for very long plural names
    {
      code: 'type VeryLongComplexUserAccountManagementSystemRecords = { id: string; };',
      errors: [
        error(
          'VeryLongComplexUserAccountManagementSystemRecords',
          'VeryLongComplexUserAccountManagementSystemRecord',
        ),
      ],
    },

    // Test irregular plurals that should be caught
    {
      code: 'type Geese = { species: string; };',
      errors: [error('Geese', 'Goose')],
    },

    {
      code: 'type Oxen = { strength: number; };',
      errors: [error('Oxen', 'Ox')],
    },

    // Additional tests to ensure the Data suffix exclusion is working correctly
    // These should be flagged because they don't end with "Data" (case-sensitive for the exact suffix)
    {
      code: 'type DataContainers = { items: any[]; };',
      errors: [error('DataContainers', 'DataContainer')],
    },

    {
      code: 'type DataProcessors = { process: (data: any) => any; };',
      errors: [error('DataProcessors', 'DataProcessor')],
    },

    // Test that plural forms of words containing "data" are still flagged
    {
      code: 'type Databases = { host: string; port: number; };',
      errors: [error('Databases', 'Database')],
    },

    // Test edge case: "Datas" should be flagged (not ending with "Data")
    {
      code: 'type Datas = { content: any; };',
      errors: [error('Datas', 'Data')],
    },

    // Test that compound words ending in plural but not "Data" are flagged
    {
      code: 'type BigDatas = { volume: number; };',
      errors: [error('BigDatas', 'BigData')],
    },
  ],
});
