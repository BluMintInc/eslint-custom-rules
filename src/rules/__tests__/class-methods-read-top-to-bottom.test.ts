import { RuleTester } from '@typescript-eslint/utils/dist/ts-eslint';
import { classMethodsReadTopToBottom } from '../class-methods-read-top-to-bottom';

const ruleTester = new RuleTester({
  parser: require.resolve('@typescript-eslint/parser'),
  parserOptions: {
    project: './tsconfig.json',
    tsconfigRootDir: __dirname,
    ecmaVersion: 2018,
    sourceType: 'module',
  },
});

ruleTester.run('class-methods-read-top-to-bottom', classMethodsReadTopToBottom, {
  valid: [
    {
      code: `
class AppInitializer {
  private mainWindow: BrowserWindow | null = null;

  constructor(
    private readonly dirname: string,
    private readonly app: overwolf.OverwolfApp,
  ) {}

  public async initialize() {
    await this.create();
    this.setupDeepLink();
    this.setupAppEvents();
    await this.setupOverwolf();
  }

  public getMainWindow(): BrowserWindow | null {
    return this.mainWindow;
  }

  private async create() {
    this.mainWindow = await createMainWindow(this.dirname);
    const windowController = new WindowController(this.mainWindow);
    windowController.setupControls();

    if (ENVIRONMENT === 'local') {
      this.mainWindow.webContents.openDevTools({ mode: 'detach' });
    }

    this.mainWindow.on('closed', () => {
      this.mainWindow = null;
    });
  }

  private setupDeepLink() {
    if (process.platform === 'win32') {
      processDeepLinkWin(this.app, this.mainWindow);
    }

    this.app.on('open-url', (event, url) => {
      event.preventDefault();

      if (!this.mainWindow) {
        this.create();
      }
      forwardUrlTo(url, this.mainWindow);
    });
  }

  private setupAppEvents() {
    this.app.on('window-all-closed', () => {
      if (process.platform !== 'darwin') {
        this.app.quit();
      }
    });

    this.app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        this.initialize();
      }
    });
  }

  private async setupOverwolf() {
    const gepManager = new GepManager(
      this.app.overwolf.packages.gep,
      this.mainWindow,
    );
    await gepManager.initialize();
  }
}`,
    },
    {
      code: `
abstract class EliminationTournament {
  public static tieRounds = <T = Timestamp>(
    rounds: Required<Round<T>, 'matches'>[],
  ): Required<Round<T>, 'matches'>[] => {
    const firstRound = rounds[0];
    if (!firstRound) {
      throw new HttpsError('internal', 'Initial round is not defined', rounds);
    }
    const firstRoundTied = { ...firstRound, next: uuidv4() };
    const newRounds = [firstRoundTied, ...rounds.slice(1, rounds.length)];
    return newRounds.map((round, i) => {
      if (i !== newRounds.length - 1) {
        LinkedListUtil.tie(round, newRounds[i + 1]!);
      }
      return round;
    });
  };

  protected constructor(
    protected readonly matchFactory: MatchFactory = new MatchFactory(),
    protected readonly roundFactory: RoundFactory = new RoundFactory(),
  ) {}

  protected get initialFactory(): MatchFactory {
    return new MatchFactory((team1, team2) => {
      const baseSettings = this.matchFactory.settings();
      const isBypass = (!team1 && !!team2) || (!!team1 && !team2);
      return isBypass
        ? {
            winner: team1 || team2,
            ...baseSettings,
          }
        : baseSettings;
    });
  }

  protected germinateBracket(
    initialRound: Required<Round, 'matches'>,
    roundCount: number,
  ) {
    const rounds = [initialRound];
    for (let i = 0; i < roundCount - 1; i++) {
      rounds.push(this.nextRound(rounds[Number(i)]!, i));
    }
    return EliminationTournament.tieRounds(rounds);
  }

  protected nextRound(
    round: Required<Round, 'matches'>,
    roundIndex?: number,
  ): Required<Round, 'matches'> {
    const matchesNext = this.nextMatches(round.matches, roundIndex);
    return this.roundFactory.build(matchesNext);
  }

  protected abstract nextMatches(
    matches: MatchAggregated[],
    roundIndex?: number,
  ): MatchAggregated[];
}`,
    },
  ],
  invalid: [
    {
      code: `
class AppInitializer {
  private mainWindow: BrowserWindow | null = null;

  constructor(
    private readonly dirname: string,
    private readonly app: overwolf.OverwolfApp,
  ) {}

  private async create() {
    this.mainWindow = await createMainWindow(this.dirname);
    const windowController = new WindowController(this.mainWindow);
    windowController.setupControls();

    if (ENVIRONMENT === 'local') {
      this.mainWindow.webContents.openDevTools({ mode: 'detach' });
    }

    this.mainWindow.on('closed', () => {
      this.mainWindow = null;
    });
  }

  private setupDeepLink() {
    if (process.platform === 'win32') {
      processDeepLinkWin(this.app, this.mainWindow);
    }

    this.app.on('open-url', (event, url) => {
      event.preventDefault();

      if (!this.mainWindow) {
        this.create();
      }
      forwardUrlTo(url, this.mainWindow);
    });
  }

  private setupAppEvents() {
    this.app.on('window-all-closed', () => {
      if (process.platform !== 'darwin') {
        this.app.quit();
      }
    });

    this.app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        this.initialize();
      }
    });
  }

  private async setupOverwolf() {
    const gepManager = new GepManager(
      this.app.overwolf.packages.gep,
      this.mainWindow,
    );
    await gepManager.initialize();
  }

  public async initialize() {
    await this.create();
    this.setupDeepLink();
    this.setupAppEvents();
    await this.setupOverwolf();
  }

  public getMainWindow(): BrowserWindow | null {
    return this.mainWindow;
  }
}`,
      output: `
class AppInitializer {
  private mainWindow: BrowserWindow | null = null;

  constructor(
    private readonly dirname: string,
    private readonly app: overwolf.OverwolfApp,
  ) {}

  public async initialize() {
    await this.create();
    this.setupDeepLink();
    this.setupAppEvents();
    await this.setupOverwolf();
  }

  public getMainWindow(): BrowserWindow | null {
    return this.mainWindow;
  }

  private async create() {
    this.mainWindow = await createMainWindow(this.dirname);
    const windowController = new WindowController(this.mainWindow);
    windowController.setupControls();

    if (ENVIRONMENT === 'local') {
      this.mainWindow.webContents.openDevTools({ mode: 'detach' });
    }

    this.mainWindow.on('closed', () => {
      this.mainWindow = null;
    });
  }

  private setupDeepLink() {
    if (process.platform === 'win32') {
      processDeepLinkWin(this.app, this.mainWindow);
    }

    this.app.on('open-url', (event, url) => {
      event.preventDefault();

      if (!this.mainWindow) {
        this.create();
      }
      forwardUrlTo(url, this.mainWindow);
    });
  }

  private setupAppEvents() {
    this.app.on('window-all-closed', () => {
      if (process.platform !== 'darwin') {
        this.app.quit();
      }
    });

    this.app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        this.initialize();
      }
    });
  }

  private async setupOverwolf() {
    const gepManager = new GepManager(
      this.app.overwolf.packages.gep,
      this.mainWindow,
    );
    await gepManager.initialize();
  }
}`,
      errors: [{ messageId: 'classMethodsReadTopToBottom' }],
    },
    {
      code: `
abstract class EliminationTournament {
  protected constructor(
    protected readonly matchFactory: MatchFactory = new MatchFactory(),
    protected readonly roundFactory: RoundFactory = new RoundFactory(),
  ) {}

  protected nextRound(
    round: Required<Round, 'matches'>,
    roundIndex?: number,
  ): Required<Round, 'matches'> {
    const matchesNext = this.nextMatches(round.matches, roundIndex);
    return this.roundFactory.build(matchesNext);
  }

  protected germinateBracket(
    initialRound: Required<Round, 'matches'>,
    roundCount: number,
  ) {
    const rounds = [initialRound];
    for (let i = 0; i < roundCount - 1; i++) {
      rounds.push(this.nextRound(rounds[Number(i)]!, i));
    }
    return EliminationTournament.tieRounds(rounds);
  }

  public static tieRounds = <T = Timestamp>(
    rounds: Required<Round<T>, 'matches'>[],
  ): Required<Round<T>, 'matches'>[] => {
    const firstRound = rounds[0];
    if (!firstRound) {
      throw new HttpsError('internal', 'Initial round is not defined', rounds);
    }
    const firstRoundTied = { ...firstRound, next: uuidv4() };
    const newRounds = [firstRoundTied, ...rounds.slice(1, rounds.length)];
    return newRounds.map((round, i) => {
      if (i !== newRounds.length - 1) {
        LinkedListUtil.tie(round, newRounds[i + 1]!);
      }
      return round;
    });
  };

  protected get initialFactory(): MatchFactory {
    return new MatchFactory((team1, team2) => {
      const baseSettings = this.matchFactory.settings();
      const isBypass = (!team1 && !!team2) || (!!team1 && !team2);
      return isBypass
        ? {
            winner: team1 || team2,
            ...baseSettings,
          }
        : baseSettings;
    });
  }

  protected abstract nextMatches(
    matches: MatchAggregated[],
    roundIndex?: number,
  ): MatchAggregated[];
}`,
      output: `
abstract class EliminationTournament {
  public static tieRounds = <T = Timestamp>(
    rounds: Required<Round<T>, 'matches'>[],
  ): Required<Round<T>, 'matches'>[] => {
    const firstRound = rounds[0];
    if (!firstRound) {
      throw new HttpsError('internal', 'Initial round is not defined', rounds);
    }
    const firstRoundTied = { ...firstRound, next: uuidv4() };
    const newRounds = [firstRoundTied, ...rounds.slice(1, rounds.length)];
    return newRounds.map((round, i) => {
      if (i !== newRounds.length - 1) {
        LinkedListUtil.tie(round, newRounds[i + 1]!);
      }
      return round;
    });
  };

  protected constructor(
    protected readonly matchFactory: MatchFactory = new MatchFactory(),
    protected readonly roundFactory: RoundFactory = new RoundFactory(),
  ) {}

  protected get initialFactory(): MatchFactory {
    return new MatchFactory((team1, team2) => {
      const baseSettings = this.matchFactory.settings();
      const isBypass = (!team1 && !!team2) || (!!team1 && !team2);
      return isBypass
        ? {
            winner: team1 || team2,
            ...baseSettings,
          }
        : baseSettings;
    });
  }

  protected germinateBracket(
    initialRound: Required<Round, 'matches'>,
    roundCount: number,
  ) {
    const rounds = [initialRound];
    for (let i = 0; i < roundCount - 1; i++) {
      rounds.push(this.nextRound(rounds[Number(i)]!, i));
    }
    return EliminationTournament.tieRounds(rounds);
  }

  protected nextRound(
    round: Required<Round, 'matches'>,
    roundIndex?: number,
  ): Required<Round, 'matches'> {
    const matchesNext = this.nextMatches(round.matches, roundIndex);
    return this.roundFactory.build(matchesNext);
  }

  protected abstract nextMatches(
    matches: MatchAggregated[],
    roundIndex?: number,
  ): MatchAggregated[];
}`,
      errors: [{ messageId: 'classMethodsReadTopToBottom' }],
    },
  ],
});
