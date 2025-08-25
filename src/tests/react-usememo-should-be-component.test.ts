import { ruleTesterJsx } from '../utils/ruleTester';
import { reactUseMemoShouldBeComponent } from '../rules/react-usememo-should-be-component';

ruleTesterJsx.run(
  'react-usememo-should-be-component',
  reactUseMemoShouldBeComponent,
  {
    valid: [
      // Test case for JSX returned from useMemo passed directly to another component via a prop
      {
        code: `
        import React, { useMemo } from 'react';

        const Component = ({ value, isTournamentAdmin }) => {
          const infoPanel = useMemo(
            () => (
              <Stack alignItems="center" direction="row" spacing={2}>
                <Typography sx={{ textTransform: 'uppercase' }} variant="h6">
                  {value}
                </Typography>

                {isTournamentAdmin && (
                  <GradientIcon
                    IconComponent={ArrowDropDownIcon}
                    sx={{ height: 26, width: 26 }}
                  />
                )}
              </Stack>
            ),
            [value, isTournamentAdmin]
          );

          return (
            <TournamentInfoPanel
              IconComponent={phaseIcon}
              iconGradientColor="primary.horizontalLight"
              title={PHASE_PANEL_TITLE}
              value={infoPanel}
            />
          );
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
      // Edge case: useMemo JSX passed as prop with different variable name
      {
        code: `
        import React, { useMemo } from 'react';

        const Component = ({ title, subtitle }) => {
          const headerContent = useMemo(() => (
            <div>
              <h1>{title}</h1>
              <h2>{subtitle}</h2>
            </div>
          ), [title, subtitle]);

          return (
            <Card
              header={headerContent}
              body="Some content"
            />
          );
        };
      `,
      },
      // Edge case: useMemo JSX passed as prop in ternary expression
      {
        code: `
        import React, { useMemo } from 'react';

        const Component = ({ showHeader, title }) => {
          const header = useMemo(() => (
            <div className="header">
              <h1>{title}</h1>
            </div>
          ), [title]);

          return (
            <Layout
              header={showHeader ? header : null}
              content="Main content"
            />
          );
        };
      `,
      },
      // Edge case: useMemo JSX passed as prop in logical AND expression
      {
        code: `
        import React, { useMemo } from 'react';

        const Component = ({ showSidebar, menuItems }) => {
          const sidebar = useMemo(() => (
            <nav>
              {menuItems.map(item => (
                <a key={item.id} href={item.url}>{item.label}</a>
              ))}
            </nav>
          ), [menuItems]);

          return (
            <Layout
              sidebar={showSidebar && sidebar}
              content="Main content"
            />
          );
        };
      `,
      },
      // Edge case: useMemo JSX passed as prop within object
      {
        code: `
        import React, { useMemo } from 'react';

        const Component = ({ user }) => {
          const avatar = useMemo(() => (
            <img src={user.avatarUrl} alt={user.name} />
          ), [user.avatarUrl, user.name]);

          return (
            <UserCard
              config={{
                avatar: avatar,
                showBadge: true,
                theme: 'dark'
              }}
            />
          );
        };
      `,
      },
      // Edge case: useMemo JSX passed as prop within array
      {
        code: `
        import React, { useMemo } from 'react';

        const Component = ({ notifications }) => {
          const notificationList = useMemo(() => (
            <ul>
              {notifications.map(n => (
                <li key={n.id}>{n.message}</li>
              ))}
            </ul>
          ), [notifications]);

          return (
            <Dashboard
              widgets={[
                <WeatherWidget key="weather" />,
                notificationList,
                <CalendarWidget key="calendar" />
              ]}
            />
          );
        };
      `,
      },
      // Edge case: useMemo JSX passed as prop using spread operator
      {
        code: `
        import React, { useMemo } from 'react';

        const Component = ({ content, ...otherProps }) => {
          const renderedContent = useMemo(() => (
            <div className="content">
              {content}
            </div>
          ), [content]);

          const props = {
            header: renderedContent,
            ...otherProps
          };

          return <Card {...props} />;
        };
      `,
      },
      // Edge case: useMemo JSX passed as prop through destructuring
      {
        code: `
        import React, { useMemo } from 'react';

        const Component = ({ data }) => {
          const chart = useMemo(() => (
            <svg>
              {data.map((point, i) => (
                <circle key={i} cx={point.x} cy={point.y} r="3" />
              ))}
            </svg>
          ), [data]);

          const { header, footer } = {
            header: chart,
            footer: <div>Chart footer</div>
          };

          return (
            <Panel
              header={header}
              footer={footer}
            />
          );
        };
      `,
      },
      // Edge case: useMemo JSX passed as prop to multiple components
      {
        code: `
        import React, { useMemo } from 'react';

        const Component = ({ message }) => {
          const alert = useMemo(() => (
            <div className="alert">
              {message}
            </div>
          ), [message]);

          return (
            <div>
              <Header alert={alert} />
              <Main alert={alert} />
              <Footer alert={alert} />
            </div>
          );
        };
      `,
      },
      // Edge case: useMemo JSX passed as prop with computed property name
      {
        code: `
        import React, { useMemo } from 'react';

        const Component = ({ type, content }) => {
          const widget = useMemo(() => (
            <div className="widget">
              {content}
            </div>
          ), [content]);

          const propName = \`\${type}Widget\`;

          return (
            <Dashboard
              {...{ [propName]: widget }}
            />
          );
        };
      `,
      },
      // Edge case: useMemo JSX passed as prop in function call
      {
        code: `
        import React, { useMemo } from 'react';

        const Component = ({ items }) => {
          const list = useMemo(() => (
            <ul>
              {items.map(item => (
                <li key={item.id}>{item.name}</li>
              ))}
            </ul>
          ), [items]);

          const renderWithList = (listComponent) => (
            <Container list={listComponent} />
          );

          return renderWithList(list);
        };
      `,
      },
      // Edge case: useMemo JSX passed as prop in nested component
      {
        code: `
        import React, { useMemo } from 'react';

        const Component = ({ user }) => {
          const profile = useMemo(() => (
            <div>
              <img src={user.avatar} alt={user.name} />
              <span>{user.name}</span>
            </div>
          ), [user]);

          return (
            <Layout>
              <Sidebar>
                <UserSection profile={profile} />
              </Sidebar>
            </Layout>
          );
        };
      `,
      },
      // Edge case: useMemo JSX passed as prop with template literal
      {
        code: `
        import React, { useMemo } from 'react';

        const Component = ({ status, message }) => {
          const statusIcon = useMemo(() => (
            <Icon name={status} color={status === 'success' ? 'green' : 'red'} />
          ), [status]);

          return (
            <Notification
              icon={statusIcon}
              message={\`Status: \${message}\`}
            />
          );
        };
      `,
      },
      // Edge case: useMemo JSX passed as prop in callback
      {
        code: `
        import React, { useMemo, useCallback } from 'react';

        const Component = ({ data }) => {
          const chart = useMemo(() => (
            <svg>
              {data.map(point => (
                <circle key={point.id} cx={point.x} cy={point.y} />
              ))}
            </svg>
          ), [data]);

          const renderChart = useCallback(() => {
            return <ChartContainer chart={chart} />;
          }, [chart]);

          return <div>{renderChart()}</div>;
        };
      `,
      },
      // Edge case: useMemo JSX passed as prop with conditional rendering
      {
        code: `
        import React, { useMemo } from 'react';

        const Component = ({ showAdvanced, settings }) => {
          const advancedPanel = useMemo(() => (
            <div className="advanced">
              {settings.map(setting => (
                <SettingItem key={setting.key} {...setting} />
              ))}
            </div>
          ), [settings]);

          if (!showAdvanced) {
            return <BasicSettings />;
          }

          return (
            <SettingsPanel
              advanced={advancedPanel}
              basic={<BasicSettings />}
            />
          );
        };
      `,
      },
      // Edge case: useMemo JSX passed as prop in switch statement
      {
        code: `
        import React, { useMemo } from 'react';

        const Component = ({ mode, data }) => {
          const visualization = useMemo(() => (
            <div className="viz">
              {data.map(item => (
                <DataPoint key={item.id} {...item} />
              ))}
            </div>
          ), [data]);

          switch (mode) {
            case 'chart':
              return <ChartView data={visualization} />;
            case 'table':
              return <TableView data={visualization} />;
            default:
              return <DefaultView data={visualization} />;
          }
        };
      `,
      },
      // Edge case: useMemo JSX passed as prop in try-catch
      {
        code: `
        import React, { useMemo } from 'react';

        const Component = ({ riskyData }) => {
          const content = useMemo(() => (
            <div>
              {riskyData.map(item => (
                <RiskyComponent key={item.id} data={item} />
              ))}
            </div>
          ), [riskyData]);

          try {
            return <SafeContainer content={content} />;
          } catch (error) {
            return <ErrorBoundary content={content} error={error} />;
          }
        };
      `,
      },
      // Edge case: useMemo JSX passed as prop with complex nesting
      {
        code: `
        import React, { useMemo } from 'react';

        const Component = ({ sections }) => {
          const sectionContent = useMemo(() => (
            <div>
              {sections.map(section => (
                <Section key={section.id}>
                  <h3>{section.title}</h3>
                  <p>{section.content}</p>
                </Section>
              ))}
            </div>
          ), [sections]);

          const config = {
            layout: {
              main: {
                content: sectionContent,
                sidebar: <Sidebar />
              }
            }
          };

          return <ComplexLayout config={config} />;
        };
      `,
      },
      // Edge case: useMemo JSX passed as prop in IIFE
      {
        code: `
        import React, { useMemo } from 'react';

        const Component = ({ items }) => {
          const itemList = useMemo(() => (
            <ul>
              {items.map(item => (
                <li key={item.id}>{item.name}</li>
              ))}
            </ul>
          ), [items]);

          return (() => {
            return <Container list={itemList} />;
          })();
        };
      `,
      },
      // Edge case: useMemo JSX passed as prop with variable reassignment
      {
        code: `
        import React, { useMemo } from 'react';

        const Component = ({ content }) => {
          const panel = useMemo(() => (
            <div className="panel">
              {content}
            </div>
          ), [content]);

          let displayPanel = panel;

          if (content.length > 100) {
            displayPanel = <TruncatedPanel content={panel} />;
          }

          return <Layout main={displayPanel} />;
        };
      `,
      },
      // Edge case: useMemo JSX passed as prop in array destructuring
      {
        code: `
        import React, { useMemo } from 'react';

        const Component = ({ widgets }) => {
          const widgetList = useMemo(() => (
            <div>
              {widgets.map(widget => (
                <Widget key={widget.id} {...widget} />
              ))}
            </div>
          ), [widgets]);

          const [primary, secondary] = [widgetList, <Sidebar />];

          return (
            <Dashboard
              primary={primary}
              secondary={secondary}
            />
          );
        };
      `,
      },
      // Additional valid: useMemo returning an array of JSX elements directly
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
      // Additional valid: useMemo with array.map returning JSX
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
      // Additional valid: useMemo with Array.from returning JSX array
      {
        code: `
        import React, { useMemo } from 'react';

        const Component = ({ count }) => {
          const items = useMemo(() => Array.from({ length: count }, (_, i) => <li key={i}>Item {i}</li>), [count]);
          return <ul>{items}</ul>;
        };
      `,
      },
      // Additional valid: useMemo with flatMap returning JSX array
      {
        code: `
        import React, { useMemo } from 'react';

        const Component = ({ sections }) => {
          const nodes = useMemo(() => sections.flatMap(s => [<h3 key={s.id+'h'}>{s.title}</h3>, <p key={s.id+'p'}>{s.text}</p>]), [sections]);
          return <div>{nodes}</div>;
        };
      `,
      },
      // Additional valid: useMemo with array literal of JSX
      {
        code: `
        import React, { useMemo } from 'react';

        const Component = ({ a, b }) => {
          const nodes = useMemo(() => [<span key="a">{a}</span>, <span key="b">{b}</span>], [a, b]);
          return <div>{nodes}</div>;
        };
      `,
      },
      // Additional valid: useMemo with JSX in nested functions returning array
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
      // useMemo with JSX in array methods other than map (returns single JSX) remains invalid
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
