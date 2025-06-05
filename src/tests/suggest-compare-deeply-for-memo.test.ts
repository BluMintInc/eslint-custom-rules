import { ruleTesterTs } from '../utils/ruleTester';
import { suggestCompareDeeplyForMemo } from '../rules/suggest-compare-deeply-for-memo';

ruleTesterTs.run('suggest-compare-deeply-for-memo', suggestCompareDeeplyForMemo, {
  valid: [
    // Component with only primitive props
    {
      code: `
        import { memo } from 'src/util/memo';

        interface UserCardProps {
          userId: string;
          isActive: boolean;
          count: number;
        }

        const UserCardUnmemoized: React.FC<UserCardProps> = ({ userId, isActive, count }) => {
          return <div>{userId}</div>;
        };

        export const UserCard = memo(UserCardUnmemoized);
      `,
      filename: 'src/components/UserCard.tsx',
    },

    // Component with complex props but already using compareDeeply
    {
      code: `
        import { memo, compareDeeply } from 'src/util/memo';

        interface UserCardProps {
          userId: string;
          userSettings: {
            theme: string;
            notifications: boolean;
          };
        }

        const UserCardUnmemoized: React.FC<UserCardProps> = ({ userId, userSettings }) => {
          return <div>{userId}</div>;
        };

        export const UserCard = memo(UserCardUnmemoized, compareDeeply('userSettings'));
      `,
      filename: 'src/components/UserCard.tsx',
    },

    // Component with custom comparison function
    {
      code: `
        import { memo } from 'src/util/memo';

        interface UserCardProps {
          userId: string;
          userSettings: {
            theme: string;
            notifications: boolean;
          };
        }

        const UserCardUnmemoized: React.FC<UserCardProps> = ({ userId, userSettings }) => {
          return <div>{userId}</div>;
        };

        export const UserCard = memo(UserCardUnmemoized, (prev, next) => prev.userId === next.userId);
      `,
      filename: 'src/components/UserCard.tsx',
    },

    // Component with function props (should not trigger)
    {
      code: `
        import { memo } from 'src/util/memo';

        interface UserCardProps {
          userId: string;
          onClick: () => void;
          onUpdate: (id: string) => void;
        }

        const UserCardUnmemoized: React.FC<UserCardProps> = ({ userId, onClick, onUpdate }) => {
          return <div onClick={onClick}>{userId}</div>;
        };

        export const UserCard = memo(UserCardUnmemoized);
      `,
      filename: 'src/components/UserCard.tsx',
    },

    // Non-tsx file should be ignored
    {
      code: `
        import { memo } from 'src/util/memo';

        interface UserCardProps {
          userId: string;
          userSettings: {
            theme: string;
          };
        }

        const UserCardUnmemoized = ({ userId, userSettings }) => {
          return userId;
        };

        export const UserCard = memo(UserCardUnmemoized);
      `,
      filename: 'src/utils/helper.ts',
    },

    // No props interface found
    {
      code: `
        import { memo } from 'src/util/memo';

        const UserCardUnmemoized = ({ userId }) => {
          return <div>{userId}</div>;
        };

        export const UserCard = memo(UserCardUnmemoized);
      `,
      filename: 'src/components/UserCard.tsx',
    },

    // Union type with only primitives
    {
      code: `
        import { memo } from 'src/util/memo';

        interface UserCardProps {
          status: 'active' | 'inactive' | 'pending';
          value: string | number | null;
        }

        const UserCardUnmemoized: React.FC<UserCardProps> = ({ status, value }) => {
          return <div>{status}</div>;
        };

        export const UserCard = memo(UserCardUnmemoized);
      `,
      filename: 'src/components/UserCard.tsx',
    },
  ],

  invalid: [
    // Basic case: component with object prop
    {
      code: `
        import { memo } from 'src/util/memo';

        interface UserCardProps {
          userId: string;
          userSettings: {
            theme: string;
            notifications: boolean;
          };
        }

        const UserCardUnmemoized: React.FC<UserCardProps> = ({ userId, userSettings }) => {
          return <div>{userId}</div>;
        };

        export const UserCard = memo(UserCardUnmemoized);
      `,
      output: `
        import { memo, compareDeeply } from 'src/util/memo';

        interface UserCardProps {
          userId: string;
          userSettings: {
            theme: string;
            notifications: boolean;
          };
        }

        const UserCardUnmemoized: React.FC<UserCardProps> = ({ userId, userSettings }) => {
          return <div>{userId}</div>;
        };

        export const UserCard = memo(UserCardUnmemoized,
  compareDeeply('userSettings'));
      `,
      filename: 'src/components/UserCard.tsx',
      errors: [{ messageId: 'suggestCompareDeeply' }],
    },

    // Component with multiple complex props
    {
      code: `
        import { memo } from 'src/util/memo';

        interface UserProfileCardProps {
          userId: string;
          userSettings: {
            theme: string;
            notifications: {
              email: boolean;
              sms: boolean;
            };
          };
          preferences: string[];
          metadata: Record<string, any>;
        }

        const UserProfileCardUnmemoized: React.FC<UserProfileCardProps> = ({ userId, userSettings, preferences, metadata }) => {
          return <div>{userId}</div>;
        };

        export const UserProfileCard = memo(UserProfileCardUnmemoized);
      `,
      output: `
        import { memo, compareDeeply } from 'src/util/memo';

        interface UserProfileCardProps {
          userId: string;
          userSettings: {
            theme: string;
            notifications: {
              email: boolean;
              sms: boolean;
            };
          };
          preferences: string[];
          metadata: Record<string, any>;
        }

        const UserProfileCardUnmemoized: React.FC<UserProfileCardProps> = ({ userId, userSettings, preferences, metadata }) => {
          return <div>{userId}</div>;
        };

        export const UserProfileCard = memo(UserProfileCardUnmemoized,
  compareDeeply('userSettings', 'preferences', 'metadata'));
      `,
      filename: 'src/components/UserProfileCard.tsx',
      errors: [{ messageId: 'suggestCompareDeeply' }],
    },

    // Component with array prop
    {
      code: `
        import { memo } from 'src/util/memo';

        interface ListComponentProps {
          title: string;
          items: string[];
        }

        const ListComponentUnmemoized: React.FC<ListComponentProps> = ({ title, items }) => {
          return <div>{title}</div>;
        };

        export const ListComponent = memo(ListComponentUnmemoized);
      `,
      output: `
        import { memo, compareDeeply } from 'src/util/memo';

        interface ListComponentProps {
          title: string;
          items: string[];
        }

        const ListComponentUnmemoized: React.FC<ListComponentProps> = ({ title, items }) => {
          return <div>{title}</div>;
        };

        export const ListComponent = memo(ListComponentUnmemoized,
  compareDeeply('items'));
      `,
      filename: 'src/components/ListComponent.tsx',
      errors: [{ messageId: 'suggestCompareDeeply' }],
    },

    // Component with tuple type
    {
      code: `
        import { memo } from 'src/util/memo';

        interface CoordinateProps {
          name: string;
          position: [number, number];
        }

        const CoordinateUnmemoized: React.FC<CoordinateProps> = ({ name, position }) => {
          return <div>{name}</div>;
        };

        export const Coordinate = memo(CoordinateUnmemoized);
      `,
      output: `
        import { memo, compareDeeply } from 'src/util/memo';

        interface CoordinateProps {
          name: string;
          position: [number, number];
        }

        const CoordinateUnmemoized: React.FC<CoordinateProps> = ({ name, position }) => {
          return <div>{name}</div>;
        };

        export const Coordinate = memo(CoordinateUnmemoized,
  compareDeeply('position'));
      `,
      filename: 'src/components/Coordinate.tsx',
      errors: [{ messageId: 'suggestCompareDeeply' }],
    },

    // Component with union type containing complex type
    {
      code: `
        import { memo } from 'src/util/memo';

        interface DataProps {
          id: string;
          data: string | { value: number; label: string } | null;
        }

        const DataUnmemoized: React.FC<DataProps> = ({ id, data }) => {
          return <div>{id}</div>;
        };

        export const Data = memo(DataUnmemoized);
      `,
      output: `
        import { memo, compareDeeply } from 'src/util/memo';

        interface DataProps {
          id: string;
          data: string | { value: number; label: string } | null;
        }

        const DataUnmemoized: React.FC<DataProps> = ({ id, data }) => {
          return <div>{id}</div>;
        };

        export const Data = memo(DataUnmemoized,
  compareDeeply('data'));
      `,
      filename: 'src/components/Data.tsx',
      errors: [{ messageId: 'suggestCompareDeeply' }],
    },

    // Component with type reference to custom interface
    {
      code: `
        import { memo } from 'src/util/memo';

        interface UserSettings {
          theme: string;
          language: string;
        }

        interface SettingsProps {
          userId: string;
          settings: UserSettings;
        }

        const SettingsUnmemoized: React.FC<SettingsProps> = ({ userId, settings }) => {
          return <div>{userId}</div>;
        };

        export const Settings = memo(SettingsUnmemoized);
      `,
      output: `
        import { memo, compareDeeply } from 'src/util/memo';

        interface UserSettings {
          theme: string;
          language: string;
        }

        interface SettingsProps {
          userId: string;
          settings: UserSettings;
        }

        const SettingsUnmemoized: React.FC<SettingsProps> = ({ userId, settings }) => {
          return <div>{userId}</div>;
        };

        export const Settings = memo(SettingsUnmemoized,
  compareDeeply('settings'));
      `,
      filename: 'src/components/Settings.tsx',
      errors: [{ messageId: 'suggestCompareDeeply' }],
    },

    // Component with Date type
    {
      code: `
        import { memo } from 'src/util/memo';

        interface EventProps {
          title: string;
          date: Date;
        }

        const EventUnmemoized: React.FC<EventProps> = ({ title, date }) => {
          return <div>{title}</div>;
        };

        export const Event = memo(EventUnmemoized);
      `,
      output: `
        import { memo, compareDeeply } from 'src/util/memo';

        interface EventProps {
          title: string;
          date: Date;
        }

        const EventUnmemoized: React.FC<EventProps> = ({ title, date }) => {
          return <div>{title}</div>;
        };

        export const Event = memo(EventUnmemoized,
  compareDeeply('date'));
      `,
      filename: 'src/components/Event.tsx',
      errors: [{ messageId: 'suggestCompareDeeply' }],
    },

    // Component with Array type reference
    {
      code: `
        import { memo } from 'src/util/memo';

        interface ListProps {
          title: string;
          items: Array<string>;
        }

        const ListUnmemoized: React.FC<ListProps> = ({ title, items }) => {
          return <div>{title}</div>;
        };

        export const List = memo(ListUnmemoized);
      `,
      output: `
        import { memo, compareDeeply } from 'src/util/memo';

        interface ListProps {
          title: string;
          items: Array<string>;
        }

        const ListUnmemoized: React.FC<ListProps> = ({ title, items }) => {
          return <div>{title}</div>;
        };

        export const List = memo(ListUnmemoized,
  compareDeeply('items'));
      `,
      filename: 'src/components/List.tsx',
      errors: [{ messageId: 'suggestCompareDeeply' }],
    },

    // Component with intersection type
    {
      code: `
        import { memo } from 'src/util/memo';

        interface BaseProps {
          id: string;
        }

        interface ExtendedProps {
          config: { theme: string };
        }

        interface CombinedProps {
          name: string;
          props: BaseProps & ExtendedProps;
        }

        const CombinedUnmemoized: React.FC<CombinedProps> = ({ name, props }) => {
          return <div>{name}</div>;
        };

        export const Combined = memo(CombinedUnmemoized);
      `,
      output: `
        import { memo, compareDeeply } from 'src/util/memo';

        interface BaseProps {
          id: string;
        }

        interface ExtendedProps {
          config: { theme: string };
        }

        interface CombinedProps {
          name: string;
          props: BaseProps & ExtendedProps;
        }

        const CombinedUnmemoized: React.FC<CombinedProps> = ({ name, props }) => {
          return <div>{name}</div>;
        };

        export const Combined = memo(CombinedUnmemoized,
  compareDeeply('props'));
      `,
      filename: 'src/components/Combined.tsx',
      errors: [{ messageId: 'suggestCompareDeeply' }],
    },

    // Component with Record type
    {
      code: `
        import { memo } from 'src/util/memo';

        interface ConfigProps {
          name: string;
          settings: Record<string, boolean>;
        }

        const ConfigUnmemoized: React.FC<ConfigProps> = ({ name, settings }) => {
          return <div>{name}</div>;
        };

        export const Config = memo(ConfigUnmemoized);
      `,
      output: `
        import { memo, compareDeeply } from 'src/util/memo';

        interface ConfigProps {
          name: string;
          settings: Record<string, boolean>;
        }

        const ConfigUnmemoized: React.FC<ConfigProps> = ({ name, settings }) => {
          return <div>{name}</div>;
        };

        export const Config = memo(ConfigUnmemoized,
  compareDeeply('settings'));
      `,
      filename: 'src/components/Config.tsx',
      errors: [{ messageId: 'suggestCompareDeeply' }],
    },

    // Component with mixed primitive and complex props
    {
      code: `
        import { memo } from 'src/util/memo';

        interface MixedProps {
          id: string;
          count: number;
          isActive: boolean;
          config: { theme: string };
          tags: string[];
          onClick: () => void;
        }

        const MixedUnmemoized: React.FC<MixedProps> = ({ id, count, isActive, config, tags, onClick }) => {
          return <div onClick={onClick}>{id}</div>;
        };

        export const Mixed = memo(MixedUnmemoized);
      `,
      output: `
        import { memo, compareDeeply } from 'src/util/memo';

        interface MixedProps {
          id: string;
          count: number;
          isActive: boolean;
          config: { theme: string };
          tags: string[];
          onClick: () => void;
        }

        const MixedUnmemoized: React.FC<MixedProps> = ({ id, count, isActive, config, tags, onClick }) => {
          return <div onClick={onClick}>{id}</div>;
        };

        export const Mixed = memo(MixedUnmemoized,
  compareDeeply('config', 'tags'));
      `,
      filename: 'src/components/Mixed.tsx',
      errors: [{ messageId: 'suggestCompareDeeply' }],
    },

    // Component already has compareDeeply import but not using it
    {
      code: `
        import { memo, compareDeeply } from 'src/util/memo';

        interface UserProps {
          name: string;
          profile: { age: number; city: string };
        }

        const UserUnmemoized: React.FC<UserProps> = ({ name, profile }) => {
          return <div>{name}</div>;
        };

        export const User = memo(UserUnmemoized);
      `,
      output: `
        import { memo, compareDeeply } from 'src/util/memo';

        interface UserProps {
          name: string;
          profile: { age: number; city: string };
        }

        const UserUnmemoized: React.FC<UserProps> = ({ name, profile }) => {
          return <div>{name}</div>;
        };

        export const User = memo(UserUnmemoized,
  compareDeeply('profile'));
      `,
      filename: 'src/components/User.tsx',
      errors: [{ messageId: 'suggestCompareDeeply' }],
    },

    // Component with React.memo (should still work but suggest custom memo first)
    {
      code: `
        import React from 'react';

        interface UserProps {
          name: string;
          data: { value: string };
        }

        const UserUnmemoized: React.FC<UserProps> = ({ name, data }) => {
          return <div>{name}</div>;
        };

        export const User = React.memo(UserUnmemoized);
      `,
      output: `
        import React from 'react';
        import { compareDeeply } from 'src/util/memo';

        interface UserProps {
          name: string;
          data: { value: string };
        }

        const UserUnmemoized: React.FC<UserProps> = ({ name, data }) => {
          return <div>{name}</div>;
        };

        export const User = React.memo(UserUnmemoized,
  compareDeeply('data'));
      `,
      filename: 'src/components/User.tsx',
      errors: [{ messageId: 'suggestCompareDeeply' }],
    },
  ],
});
