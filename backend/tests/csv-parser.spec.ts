import { RecipientService } from '../src/recipients/recipient.service';

describe('RecipientService & CSV Parser', () => {
  it('should validate email formats strictly', () => {
    expect(RecipientService.isValidEmail('valid.user@example.com')).toBe(true);
    expect(RecipientService.isValidEmail('invalid-email')).toBe(false);
    expect(RecipientService.isValidEmail('@missinguser.com')).toBe(false);
    expect(RecipientService.isValidEmail('spaces in@email.com')).toBe(false);
    expect(RecipientService.isValidEmail('')).toBe(false);
  });

  it('should parse CSV with deduplication and invalid address detection', async () => {
    const csvContent = `Email Address,First Name,Last Name,Company
valid1@example.com,Alice,Smith,Alpha Corp
valid2@example.com,Bob,Jones,Beta LLC
invalid-email,Charlie,Brown,Gamma Inc
valid1@example.com,Alice,Smith,Alpha Corp
valid3@example.com,Dave,Wilson,Delta Ltd
`;

    const buffer = Buffer.from(csvContent, 'utf-8');
    const summary = await RecipientService.importFromBuffer(
      buffer,
      'csv',
      {
        email: 'Email Address',
        firstName: 'First Name',
        lastName: 'Last Name',
        organisation: 'Company',
      },
      { batchSize: 2 }
    );

    expect(summary.totalRows).toBe(5);
    expect(summary.validRecords).toBe(3); // valid1, valid2, valid3
    expect(summary.invalidEmailCount).toBe(1); // invalid-email
    expect(summary.duplicateCount).toBe(1); // duplicate valid1
  });
});
