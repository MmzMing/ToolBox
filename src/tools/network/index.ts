import type { DefinedTool } from '../define-tool'

import { tool as ipv4SubnetCalculator } from './ipv4-subnet-calculator'
import { tool as ipv4AddressConverter } from './ipv4-address-converter'
import { tool as ipv4RangeExpander } from './ipv4-range-expander'
import { tool as macAddressLookup } from './mac-address-lookup'
import { tool as macAddressGenerator } from './mac-address-generator'
import { tool as ipv6UlaGenerator } from './ipv6-ula-generator'
import { tool as ipLookup } from './ip-lookup'

export const networkTools: readonly DefinedTool[] = [
  ipv4SubnetCalculator,
  ipv4AddressConverter,
  ipv4RangeExpander,
  macAddressLookup,
  macAddressGenerator,
  ipv6UlaGenerator,
  ipLookup,
]
