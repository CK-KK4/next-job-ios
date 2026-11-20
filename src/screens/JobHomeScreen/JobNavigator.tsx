import React from 'react';
import {Alert} from 'react-native';
import {Button} from 'react-native-paper';
import {
  createStackNavigator,
  StackNavigationProp,
} from '@react-navigation/stack';
import {useNavigation} from '@react-navigation/native';
import {observer} from 'mobx-react-lite';
import {HeaderLeft} from '../../components/HeaderLeft/HeaderLeft';
import {useTheme} from '../../hooks/useTheme';
import {modelStore} from '../../store/ModelStore';
import {jobAgentLabel} from '../../services/nextJobAgents';
import {NEXT_JOB_PALS} from '../../store/nextJobPals';
import {JobWorkspace, JobStackParams, useJobWorkspace} from './JobWorkspace';
import JobHomeScreen from './JobHomeScreen';
import {JobTaskScreen} from './JobTaskScreen';
import {JobAgentsScreen} from './JobAgentsScreen';
const Stack = createStackNavigator<JobStackParams>();
const AgentButton = observer(() => {
  const navigation = useNavigation<StackNavigationProp<JobStackParams>>();
  const {busy} = useJobWorkspace();
  return (
    <Button
      compact
      icon="chevron-down"
      testID="job-agent-picker"
      accessibilityLabel={`选择 Agent，当前${jobAgentLabel()}`}
      onPress={() => {
        if (busy || modelStore.isGenerationBusy) {
          Alert.alert('请稍等', '当前操作结束或停止后，再切换 Agent。');
          return;
        }
        navigation.navigate('JobAgents');
      }}>
      {jobAgentLabel()}
    </Button>
  );
});
const agentButton = () => <AgentButton />;
const menuButton = () => <HeaderLeft />;
export default function JobNavigator() {
  const theme = useTheme();
  return (
    <JobWorkspace>
      <Stack.Navigator
        screenOptions={{
          headerStyle: {backgroundColor: theme.colors.background},
          headerTintColor: theme.colors.onBackground,
          headerTitleStyle: {fontSize: 18},
          headerRight: agentButton,
          cardStyle: {backgroundColor: theme.colors.background},
        }}>
        <Stack.Screen
          name="JobHome"
          component={JobHomeScreen}
          options={{title: '下一站', headerLeft: menuButton}}
        />
        <Stack.Screen
          name="JobTask"
          component={JobTaskScreen}
          options={({route}) => ({
            title:
              NEXT_JOB_PALS.find(
                item => item.parameters.nextJobRole === route.params.role,
              )?.name ?? '求职助手',
          })}
        />
        <Stack.Screen
          name="JobAgents"
          component={JobAgentsScreen}
          options={{title: '选择 Agent', headerRight: () => null}}
        />
      </Stack.Navigator>
    </JobWorkspace>
  );
}
