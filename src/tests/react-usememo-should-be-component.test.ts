import { ruleTesterJsx } from '../utils/ruleTester';
import { reactUseMemoShouldBeComponent } from '../rules/react-usememo-should-be-component';

ruleTesterJsx.run(
  'react-usememo-should-be-component',
  reactUseMemoShouldBeComponent,
  {
    valid: [
      // Test case for the specific bug: useMemo returning an array of JSX elements via map
      {
        code: `
        import React, { useMemo, memo } from 'react';

        const RoundStepper = memo(function RoundStepperUnmemoized({
          roundStepsRendered,
          isLoserBracket
        }) {
          const formatPayout = (tokens) => \`\${tokens} tokens\`;

          // This useMemo should NOT be flagged by the ESLint rule
          const roundStepsComponents = useMemo(() => {
            return roundStepsRendered.map((roundStep) => {
              const { payout, roundNumber, isReversed } = roundStep;

              const roundPayout = formatPayout(payout.payout?.tokens);
              return (
                <RoundStep
                  key={\`\${isReversed}-\${roundNumber}\`}
                  {...roundStep}
                  isInverted={isLoserBracket}
                  payout={roundPayout}
                />
              );
            });
          }, [roundStepsRendered, formatPayout, isLoserBracket]);

          return <div>{roundStepsComponents}</div>;
        });

        // Mock component for testing
        const RoundStep = ({ isInverted, payout, ...props }) => {
          return <div>{payout}</div>;
        };
        `,
      },
      // Test case for the specific bug: useMemo returning conditional JSX that can be false (with logical AND)
      {
        code: `
        import React, { useMemo } from 'react';
        import { SponsorsV3 } from '../SponsorsV3';
        import { useTheme } from '@mui/material/styles';

        const Component = ({ sponsors }) => {
          const theme = useTheme();

          const sponsorsPanel = useMemo(() => {
            return (
              !!sponsors && (
                <SponsorsV3 sponsors={sponsors} sx={{ ...theme.panels[0] }} />
              )
            );
          }, [sponsors?.length]);

          return <div>{sponsorsPanel}</div>;
        };
      `,
      },
      // Test case for the specific bug: useMemo returning conditional JSX that can be false (with logical AND and comparison)
      {
        code: `
        import React, { useMemo } from 'react';
        import { MatchTop3 } from './MatchTop3';

        const Component = ({ match }) => {
          const top3 = useMemo(() => {
            return (
              !!match &&
              match.resultsAggregation.winThresholdExceeders.length > 3 && <MatchTop3 />
            );
          }, [match?.resultsAggregation.winThresholdExceeders.length]);

          return <div>{top3}</div>;
        };
      `,
      },
      // Test case for the specific bug: useMemo returning a number calculation
      {
        code: `
        import React, { useMemo } from 'react';

        const Component = ({ myFriends, friends }) => {
          const mutualFriendsCountEstimate = useMemo(() => {
            if (!myFriends || !friends) {
              return 0;
            }
            const mutualFriends = myFriends.filter((friendId) => {
              return friends.includes(friendId);
            });
            return mutualFriends.length;
          }, [friends, myFriends]);

          return <div>You have {mutualFriendsCountEstimate} mutual friends</div>;
        };
      `,
      },
      // Test case for useMemo returning a string
      {
        code: `
        import React, { useMemo } from 'react';

        const Component = ({ firstName, lastName }) => {
          const fullName = useMemo(() => {
            return firstName && lastName ? \`\${firstName} \${lastName}\` : '';
          }, [firstName, lastName]);

          return <div>Welcome, {fullName}</div>;
        };
      `,
      },
      // Test case for useMemo returning a boolean
      {
        code: `
        import React, { useMemo } from 'react';

        const Component = ({ permissions, requiredPermission }) => {
          const hasPermission = useMemo(() => {
            return permissions.includes(requiredPermission);
          }, [permissions, requiredPermission]);

          return <div>{hasPermission ? 'Access granted' : 'Access denied'}</div>;
        };
      `,
      },
      // Test case for useMemo returning null
      {
        code: `
        import React, { useMemo } from 'react';

        const Component = ({ data }) => {
          const processedValue = useMemo(() => {
            if (!data || data.length === 0) {
              return null;
            }
            return data.reduce((sum, item) => sum + item.value, 0);
          }, [data]);

          return <div>{processedValue !== null ? processedValue : 'No data'}</div>;
        };
      `,
      },
      // Test case for useMemo returning an array of non-JSX values
      {
        code: `
        import React, { useMemo } from 'react';

        const Component = ({ items }) => {
          const processedItems = useMemo(() => {
            return items.map(item => item.value * 2);
          }, [items]);

          return (
            <ul>
              {processedItems.map((value, index) => (
                <li key={index}>{value}</li>
              ))}
            </ul>
          );
        };
      `,
      },
      // Test case for useMemo returning a complex object with no JSX
      {
        code: `
        import React, { useMemo } from 'react';

        const Component = ({ user, settings }) => {
          const userSettings = useMemo(() => {
            return {
              id: user.id,
              name: user.name,
              preferences: {
                theme: settings.theme || 'light',
                fontSize: settings.fontSize || 'medium',
                notifications: settings.notifications !== undefined ? settings.notifications : true
              }
            };
          }, [user, settings]);

          return (
            <div>
              <h2>{userSettings.name}'s Settings</h2>
              <p>Theme: {userSettings.preferences.theme}</p>
              <p>Font Size: {userSettings.preferences.fontSize}</p>
            </div>
          );
        };
      `,
      },
      // useMemo with non-JSX return is valid
      {
        code: `
        import React, { useMemo } from 'react';

        const Component = () => {
          const value = useMemo(() => {
            return 42;
          }, []);

          return <div>{value}</div>;
        };
      `,
      },
      // useMemo returning an object that contains JSX elements should be valid
      {
        code: `
        import React, { useMemo } from 'react';

        const Component = ({ round }) => {
          const matchTabPanes = useMemo(() => {
            if (!round) {
              return [];
            }
            const { matchesAggregation, id: roundId } = round;
            const { matchPreviews } = matchesAggregation;

            return Object.entries(matchPreviews).map(
              ([matchId, { stage, name, numberOfTeams, maxTeamsPerMatch }]) => {
                return {
                  value: name,
                  children: (
                    <Typography
                      color="text.primary"
                      sx={{ width: '100%', textAlign: 'center' }}
                      variant="body1"
                    >
                      {numberOfTeams}/{maxTeamsPerMatch}
                    </Typography>
                  ),
                  component: (
                    <MatchDetailsProvider matchId={matchId} roundId={roundId}>
                      <MatchPane />
                    </MatchDetailsProvider>
                  ),
                  customization: {
                    disabled: stage === 'not-ready',
                  },
                  stage,
                };
              },
            );
          }, [round]);

          return <div>{matchTabPanes.length}</div>;
        };
      `,
      },
      // useMemo with object return is valid
      {
        code: `
        import React, { useMemo } from 'react';

        const Component = () => {
          const styles = useMemo(() => ({
            color: 'red',
            fontSize: '16px'
          }), []);

          return <div style={styles}>Hello</div>;
        };
      `,
      },
      // useMemo with array of non-JSX is valid
      {
        code: `
        import React, { useMemo } from 'react';

        const Component = () => {
          const items = useMemo(() => [1, 2, 3, 4, 5], []);

          return (
            <div>
              {items.map(item => <span key={item}>{item}</span>)}
            </div>
          );
        };
      `,
      },
      // useMemo returning an array of JSX elements via map should be valid
      {
        code: `
        import React, { useMemo } from 'react';

        const Component = ({ items }) => {
          const elements = useMemo(() => {
            return items.map(item => (
              <div key={item.id}>{item.name}</div>
            ));
          }, [items]);

          return <div>{elements}</div>;
        };
      `,
      },
      // useMemo returning an array of JSX elements via map with inline arrow function should be valid
      {
        code: `
        import React, { useMemo } from 'react';

        const Component = ({ items }) => {
          const renderedItems = useMemo(() =>
            items.map(item => <ListItem key={item.id}>{item.name}</ListItem>)
          , [items]);

          return <List>{renderedItems}</List>;
        };
      `,
      },
      // useMemo returning an array of JSX elements via map with inner function should be valid
      {
        code: `
        import React, { useMemo } from 'react';

        const Component = ({ data }) => {
          const processedContent = useMemo(() => {
            const renderItem = (item) => {
              return <div key={item.id}>{item.name}</div>;
            };

            return data.map(renderItem);
          }, [data]);

          return <div>{processedContent}</div>;
        };
      `,
      },
      // Proper component with memo is valid
      {
        code: `
        import React, { memo } from 'react';

        const UserAvatar = memo(({ imgUrl, username }) => (
          <Link href={\`/\${username}\`}>
            <AvatarNextLive alt={username} height={56} src={imgUrl} width={56} />
          </Link>
        ));

        const Component = ({ streamer }) => {
          return <UserAvatar imgUrl={streamer.imgUrl} username={streamer.username} />;
        };
      `,
      },
      // useMemo with complex calculation but no JSX
      {
        code: `
        import React, { useMemo } from 'react';

        const Component = ({ data, threshold }) => {
          const processedData = useMemo(() => {
            const result = {};
            for (const item of data) {
              if (item.value > threshold) {
                result[item.id] = item.value * 2;
              } else {
                result[item.id] = item.value / 2;
              }
            }
            return result;
          }, [data, threshold]);

          return <div>{Object.values(processedData).join(', ')}</div>;
        };
      `,
      },
      // useMemo with string manipulation
      {
        code: `
        import React, { useMemo } from 'react';

        const Component = ({ text }) => {
          const formattedText = useMemo(() => {
            return text
              .split(' ')
              .map(word => word.charAt(0).toUpperCase() + word.slice(1))
              .join(' ');
          }, [text]);

          return <p>{formattedText}</p>;
        };
      `,
      },
      // useMemo with function return
      {
        code: `
        import React, { useMemo } from 'react';

        const Component = ({ baseValue }) => {
          const calculator = useMemo(() => {
            return {
              add: (x) => baseValue + x,
              subtract: (x) => baseValue - x,
              multiply: (x) => baseValue * x
            };
          }, [baseValue]);

          return <div>Result: {calculator.add(5)}</div>;
        };
      `,
      },
      // useMemo with complex ternary but no JSX
      {
        code: `
        import React, { useMemo } from 'react';

        const Component = ({ condition, valueA, valueB }) => {
          const result = useMemo(() =>
            condition
              ? valueA > 10
                ? valueA * 2
                : valueA / 2
              : valueB > 20
                ? valueB * 3
                : valueB / 3
          , [condition, valueA, valueB]);

          return <div>{result}</div>;
        };
      `,
      },
      // useMemo with regex operations
      {
        code: `
        import React, { useMemo } from 'react';

        const Component = ({ input }) => {
          const matches = useMemo(() => {
            const regex = /\\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}\\b/gi;
            return input.match(regex) || [];
          }, [input]);

          return (
            <div>
              <p>Found {matches.length} email addresses</p>
              <ul>
                {matches.map((email, i) => <li key={i}>{email}</li>)}
              </ul>
            </div>
          );
        };
      `,
      },
      // useMemo with data transformation for chart
      {
        code: `
        import React, { useMemo } from 'react';

        const Component = ({ rawData }) => {
          const chartData = useMemo(() => {
            return {
              labels: rawData.map(d => d.label),
              datasets: [{
                data: rawData.map(d => d.value),
                backgroundColor: rawData.map(d => d.color || '#ccc')
              }]
            };
          }, [rawData]);

          return <Chart data={chartData} />;
        };
      `,
      },
      // useMemo with very simple JSX (single element) - could be considered an exception
      {
        code: `
        import React, { useMemo } from 'react';

        const Component = ({ text }) => {
          // This is a borderline case that could be allowed with an option
          const formattedText = text.toUpperCase();

          return <div>{formattedText}</div>;
        };
      `,
      },
      // useMemo with JSX that is used multiple times in the component - should be allowed
      {
        code: `
        import React, { useMemo } from 'react';

        const AvatarStatusUnmemoized = ({
          onlineStatus,
          imgUrl,
          height,
          width,
          showStatus = false,
          badgeSx = DEFAULT_SX,
          avatarSx = DEFAULT_SX,
          ...props
        }) => {
          const theme = useTheme();

          const avatar = useMemo(() => {
            return (
              <AvatarNext
                height={height}
                src={imgUrl}
                sx={avatarSx}
                width={width}
                {...props}
              />
            );
          }, [imgUrl, height, width, avatarSx, props]);

          if (!showStatus) {
            return avatar;
          }

          return (
            <StatusBadge
              color={onlineStatus}
              sx={{
                '& .MuiBadge-badge': {
                  borderRadius: '50%',
                  height: '14px',
                  width: '14px',
                  border: \`2px solid \${theme.palette.background.elevation[6]}\`,
                  boxShadow: \`inset 0 0 0 1px \${theme.palette.text.primary}\`,
                  ...badgeSx?.['.MuiBadge-badge'],
                },
                ...badgeSx,
              }}
            >
              {avatar}
            </StatusBadge>
          );
        };
      `,
      },
      // useMemo with computed values for props but no JSX
      {
        code: `
        import React, { useMemo } from 'react';

        const Component = ({ items, filter }) => {
          const filteredItems = useMemo(() => {
            return items.filter(item => {
              const matchesFilter = item.name.includes(filter);
              const isActive = item.status === 'active';
              return matchesFilter && isActive;
            });
          }, [items, filter]);

          return (
            <ul>
              {filteredItems.map(item => (
                <li key={item.id}>{item.name}</li>
              ))}
            </ul>
          );
        };
      `,
      },
    ],
    invalid: [
      // useMemo returning JSX directly
      {
        code: `
        import React, { useMemo } from 'react';

        const Component = ({ streamer }) => {
          const { imgUrl, username } = streamer;

          const userAvatar = useMemo(() => {
            return (
              <Link href={\`/\${username}\`}>
                <AvatarNextLive alt={username} height={56} src={imgUrl} width={56} />
              </Link>
            );
          }, [imgUrl, username]);

          return <div>{userAvatar}</div>;
        };
      `,
        errors: [{ messageId: 'useMemoShouldBeComponent' }],
      },
      // useMemo with direct JSX return (no block)
      {
        code: `
        import React, { useMemo } from 'react';

        const Component = ({ title }) => {
          const header = useMemo(() => (
            <Stack alignItems="flex-start">
              <Typography variant="h5">{title}</Typography>
            </Stack>
          ), [title]);

          return <div>{header}</div>;
        };
      `,
        errors: [{ messageId: 'useMemoShouldBeComponent' }],
      },
      // useMemo with conditional JSX
      {
        code: `
        import React, { useMemo } from 'react';

        const Component = ({ isAdmin, user }) => {
          const userInfo = useMemo(() => {
            if (isAdmin) {
              return <AdminBadge user={user} />;
            }
            return <UserBadge user={user} />;
          }, [isAdmin, user]);

          return <div>{userInfo}</div>;
        };
      `,
        errors: [{ messageId: 'useMemoShouldBeComponent' }],
      },
      // This test case was moved to the valid section
      // Multiple useMemo with JSX in the same component
      {
        code: `
        import React, { useMemo } from 'react';

        const LivestreamInfo = ({ streamer, title, description }) => {
          const { imgUrl, username } = streamer;

          const userAvatar = useMemo(() => {
            return (
              <Link href={\`/\${username}\`}>
                <AvatarNextLive alt={username} height={56} src={imgUrl} width={56} />
              </Link>
            );
          }, [imgUrl, username]);

          const header = useMemo(() => {
            return (
              <Stack alignItems="flex-start">
                <Typography variant="h5">{title}</Typography>
              </Stack>
            );
          }, [title]);

          return (
            <Stack>
              {userAvatar}
              {header}
            </Stack>
          );
        };
      `,
        errors: [
          { messageId: 'useMemoShouldBeComponent' },
          { messageId: 'useMemoShouldBeComponent' },
        ],
      },
      // useMemo with nested JSX structure
      {
        code: `
        import React, { useMemo } from 'react';

        const Component = ({ data, isLoading }) => {
          const content = useMemo(() => {
            if (isLoading) {
              return (
                <div className="loading-container">
                  <Spinner size="large" />
                  <div className="loading-text">
                    <p>Loading your data...</p>
                    <small>This may take a few moments</small>
                  </div>
                </div>
              );
            }

            return (
              <div className="data-container">
                <h2>Results</h2>
                {data.length === 0 ? (
                  <EmptyState message="No results found" />
                ) : (
                  <ul>
                    {data.map(item => (
                      <li key={item.id}>{item.name}</li>
                    ))}
                  </ul>
                )}
              </div>
            );
          }, [data, isLoading]);

          return <div className="wrapper">{content}</div>;
        };
      `,
        errors: [{ messageId: 'useMemoShouldBeComponent' }],
      },
      // useMemo with JSX fragments
      {
        code: `
        import React, { useMemo } from 'react';

        const Component = ({ user }) => {
          const userDetails = useMemo(() => (
            <>
              <h3>{user.name}</h3>
              <p>{user.email}</p>
              <p>{user.location}</p>
            </>
          ), [user]);

          return <div className="user-card">{userDetails}</div>;
        };
      `,
        errors: [{ messageId: 'useMemoShouldBeComponent' }],
      },
      // useMemo with complex conditional rendering
      {
        code: `
        import React, { useMemo } from 'react';

        const Component = ({ status, data, error }) => {
          const statusDisplay = useMemo(() => {
            switch (status) {
              case 'loading':
                return <LoadingSpinner />;
              case 'error':
                return <ErrorMessage message={error} />;
              case 'empty':
                return <EmptyState />;
              case 'success':
                return (
                  <div className="success">
                    <CheckIcon />
                    <p>Operation completed successfully!</p>
                  </div>
                );
              default:
                return <p>Unknown status</p>;
            }
          }, [status, error]);

          return <div className="status-container">{statusDisplay}</div>;
        };
      `,
        errors: [{ messageId: 'useMemoShouldBeComponent' }],
      },
      // useMemo with JSX in ternary expressions
      {
        code: `
        import React, { useMemo } from 'react';

        const Component = ({ isLoggedIn, user }) => {
          const authStatus = useMemo(() =>
            isLoggedIn
              ? (
                <div className="user-info">
                  <Avatar src={user.avatar} />
                  <span>{user.name}</span>
                </div>
              )
              : (
                <div className="login-prompt">
                  <LoginIcon />
                  <span>Please log in</span>
                </div>
              )
          , [isLoggedIn, user]);

          return <div className="auth-container">{authStatus}</div>;
        };
      `,
        errors: [{ messageId: 'useMemoShouldBeComponent' }],
      },
      // useMemo with JSX in array methods other than map
      {
        code: `
        import React, { useMemo } from 'react';

        const Component = ({ items }) => {
          const firstItem = useMemo(() =>
            items.find(item => item.isSpecial)
              ? <SpecialItem item={items.find(item => item.isSpecial)} />
              : <p>No special items found</p>
          , [items]);

          return <div>{firstItem}</div>;
        };
      `,
        errors: [{ messageId: 'useMemoShouldBeComponent' }],
      },
      // This test case was moved to the valid section
      // useMemo with JSX in IIFE
      {
        code: `
        import React, { useMemo } from 'react';

        const Component = ({ config }) => {
          const configPanel = useMemo(() => {
            return (() => {
              const { theme, layout, showHeader } = config;

              return (
                <div className={\`panel \${theme}\`}>
                  {showHeader && <Header />}
                  <div className={\`content \${layout}\`}>
                    <p>Configuration panel</p>
                  </div>
                </div>
              );
            })();
          }, [config]);

          return <div>{configPanel}</div>;
        };
      `,
        errors: [{ messageId: 'useMemoShouldBeComponent' }],
      },
      // useMemo with complex JSX and multiple returns
      {
        code: `
        import React, { useMemo } from 'react';

        const Component = ({ step, formData }) => {
          const formStep = useMemo(() => {
            if (step === 1) {
              return (
                <div className="step-1">
                  <h2>Personal Information</h2>
                  <input type="text" value={formData.name} placeholder="Name" />
                  <input type="email" value={formData.email} placeholder="Email" />
                </div>
              );
            } else if (step === 2) {
              return (
                <div className="step-2">
                  <h2>Address</h2>
                  <input type="text" value={formData.street} placeholder="Street" />
                  <input type="text" value={formData.city} placeholder="City" />
                </div>
              );
            } else {
              return (
                <div className="step-3">
                  <h2>Review</h2>
                  <p>Name: {formData.name}</p>
                  <p>Email: {formData.email}</p>
                  <p>Address: {formData.street}, {formData.city}</p>
                </div>
              );
            }
          }, [step, formData]);

          return <form>{formStep}</form>;
        };
      `,
        errors: [{ messageId: 'useMemoShouldBeComponent' }],
      },
      // useMemo with dynamic component creation
      {
        code: `
        import React, { useMemo } from 'react';

        const Component = ({ componentType, props }) => {
          const dynamicComponent = useMemo(() => {
            const components = {
              button: <Button {...props} />,
              input: <Input {...props} />,
              select: <Select {...props} />
            };

            return components[componentType] || <div>Unknown component type</div>;
          }, [componentType, props]);

          return <div className="dynamic-component-wrapper">{dynamicComponent}</div>;
        };
      `,
        errors: [{ messageId: 'useMemoShouldBeComponent' }],
      },
      // useMemo with template literals in JSX
      {
        code: `
        import React, { useMemo } from 'react';

        const Component = ({ user, theme }) => {
          const userGreeting = useMemo(() => (
            <div className={\`greeting \${theme}\`}>
              <h2>{\`Hello, \${user.name}!\`}</h2>
              <p>{\`Welcome back to your \${user.plan} account\`}</p>
            </div>
          ), [user, theme]);

          return <div>{userGreeting}</div>;
        };
      `,
        errors: [{ messageId: 'useMemoShouldBeComponent' }],
      },
    ],
  },
);
