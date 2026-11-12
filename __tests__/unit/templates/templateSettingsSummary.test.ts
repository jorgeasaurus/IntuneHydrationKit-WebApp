import { describe, expect, it } from 'vitest'

import {
  getPayloadODataType,
  summarizeTemplateSettings,
} from '@/components/templates/templateSettingsSummary'

describe('summarizeTemplateSettings', () => {
  it('lists Settings Catalog definitions with nested choice, simple, and group values', () => {
    const payload = {
      '@odata.type': '#microsoft.graph.deviceManagementConfigurationPolicy',
      name: '[IHD] Edge',
      settings: [
        {
          settingInstance: {
            settingDefinitionId: 'device_edge_smartscreen',
            choiceSettingValue: {
              value: 'device_edge_smartscreen_1',
              children: [
                {
                  settingDefinitionId: 'device_edge_smartscreen_level',
                  simpleSettingValue: { value: 3 },
                },
              ],
            },
          },
        },
        {
          settingInstance: {
            settingDefinitionId: 'device_asr',
            groupSettingCollectionValue: [
              {
                children: [
                  {
                    settingDefinitionId: 'device_asr_rule',
                    choiceSettingValue: { value: 'device_asr_rule_audit', children: [] },
                  },
                ],
              },
            ],
          },
        },
        {
          settingInstance: {
            settingDefinitionId: 'device_list',
            simpleSettingCollectionValue: [{ value: 'a' }, { value: 'b' }],
          },
        },
      ],
    }

    expect(summarizeTemplateSettings(payload)).toEqual({
      kind: 'settingsCatalog',
      rows: [
        { label: 'device_edge_smartscreen', value: '1' },
        { label: 'device_edge_smartscreen_level', value: '3' },
        { label: 'device_asr_rule', value: 'audit' },
        { label: 'device_list', value: 'a, b' },
      ],
    })
  })

  it('lists configured properties and skips Graph metadata', () => {
    const payload = {
      '@odata.type': '#microsoft.graph.windows10CompliancePolicy',
      '@odata.context': 'https://graph.microsoft.com',
      'createdDateTime@odata.type': '#DateTimeOffset',
      id: '123',
      displayName: '[IHD] Windows',
      description: 'Imported by Intune Hydration Kit',
      passwordRequired: true,
      osMinimumVersion: '10.0.22631',
      assignments: [],
      emptyList: [],
      unset: null,
      conditions: { platforms: { includePlatforms: ['android', 'iOS'] } },
      scheduledActionsForRule: [{ ruleName: 'a' }],
    }

    expect(summarizeTemplateSettings(payload)).toEqual({
      kind: 'properties',
      rows: [
        { label: 'passwordRequired', value: 'true' },
        { label: 'osMinimumVersion', value: '10.0.22631' },
        { label: 'conditions.platforms.includePlatforms', value: 'android, iOS' },
        { label: 'scheduledActionsForRule', value: '1 item' },
      ],
    })
    expect(getPayloadODataType(payload)).toBe('#microsoft.graph.windows10CompliancePolicy')
  })

  it('returns null when nothing can be summarized', () => {
    expect(summarizeTemplateSettings(null)).toBeNull()
    expect(summarizeTemplateSettings('text')).toBeNull()
    expect(summarizeTemplateSettings({ displayName: 'Only a name' })).toBeNull()
    expect(getPayloadODataType(null)).toBeUndefined()
  })
})
