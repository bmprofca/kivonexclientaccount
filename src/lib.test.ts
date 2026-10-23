import { addDays, amountInWords, computers, daysBetween, formatMoney, initials, months, numberInWords } from './lib'

describe('money on plans and invoices', () => {
  it('shows paise as rupees with Indian grouping, paise only when there are some', () => {
    expect(formatMoney(999900)).toBe('₹9,999')
    expect(formatMoney(12345650)).toBe('₹1,23,456.50')
    expect(formatMoney(999900, { paise: true })).toBe('₹9,999.00')
  })

  it('writes an amount in words the Indian way', () => {
    expect(numberInWords(0)).toBe('Zero')
    expect(numberInWords(9999)).toBe('Nine Thousand Nine Hundred Ninety Nine')
    expect(numberInWords(12_34_56_789)).toBe('Twelve Crore Thirty Four Lakh Fifty Six Thousand Seven Hundred Eighty Nine')
    expect(amountInWords(999900)).toBe('Rupees Nine Thousand Nine Hundred Ninety Nine Only')
    expect(amountInWords(847373)).toBe('Rupees Eight Thousand Four Hundred Seventy Three and Seventy Three Paise Only')
  })
})

describe('plan dates and labels', () => {
  it('counts days across months and years', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
    expect(daysBetween('2026-10-23', '2027-10-23')).toBe(365)
  })

  it('names periods, computers and people', () => {
    expect(months(1)).toBe('1 month')
    expect(months(12)).toBe('12 months')
    expect(computers(1)).toBe('1 computer')
    expect(computers(3)).toBe('3 computers')
    expect(initials('Asha Mehta')).toBe('AM')
    expect(initials('  ')).toBe('?')
  })
})
