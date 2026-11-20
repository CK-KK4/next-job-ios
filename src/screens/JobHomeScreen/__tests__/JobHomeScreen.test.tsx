import React from 'react';
import {AppState} from 'react-native';
import {render, fireEvent, waitFor} from '@testing-library/react-native';
import JobHomeScreen from '../JobHomeScreen';
const mockNavigate = jest.fn();
jest.mock('../../../hooks/useTheme', () => ({
  useTheme: () => ({
    colors: {background: '#fff', surface: '#fff', outlineVariant: '#ddd'},
  }),
}));
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({navigate: mockNavigate}),
  useIsFocused: () => true,
}));
jest.mock('../../../services/nextJobModel', () => ({
  ensureJobModel: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../../services/nextJobAgents', () => ({
  jobAgentLabel: () => '本地 AI · 免费',
  selectedJobProvider: () => 'local',
}));
jest.mock('../JobRecordButton', () => ({JobRecordButton: () => null}));
beforeEach(() => {
  jest.clearAllMocks();
  Object.defineProperty(AppState, 'currentState', {
    configurable: true,
    value: 'active',
  });
});
it.each(['job', 'resume', 'interview', 'test', 'review'])(
  'opens %s as a separate screen',
  async role => {
    const screen = render(<JobHomeScreen />);
    await waitFor(() =>
      expect(screen.getByText('AI 已自动加载，可以直接聊。')).toBeTruthy(),
    );
    fireEvent.press(screen.getByTestId(`job-card-${role}`));
    expect(mockNavigate).toHaveBeenCalledWith('JobTask', {role});
    expect(screen.queryByTestId(`job-panel-${role}`)).toBeNull();
  },
);
