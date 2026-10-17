import React, { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { AppInput } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { WorkspaceNotice } from '@/components/workspace/WorkspaceUI';
import { Link, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import {
  ArrowRight, Building2, Globe2, Info, Mail, Phone, ShieldCheck, User,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { submitEnterpriseOnboardingRequest } from '@/services/enterpriseOnboardingService';
import AuthField from './components/AuthField';

const INITIAL_FORM = {
  proposed_account_name: '',
  workspace_slug: '',
  website: '',
  country: '',
  contact_person_name: '',
  contact_email: '',
  phone: '',
  business_description: '',
  terms_accepted: false,
};

const COUNTRY_OPTIONS = [
  { value: 'United States', flag: '🇺🇸' },
  { value: 'Canada', flag: '🇨🇦' },
  { value: 'United Kingdom', flag: '🇬🇧' },
  { value: 'Australia', flag: '🇦🇺' },
  { value: 'Nepal', flag: '🇳🇵' },
  { value: 'Other', flag: '🏳️' },
];

const EnterpriseSignup = () => {
  const [formData, setFormData] = useState(INITIAL_FORM);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, []);

  const updateFormData = (event) => {
    const { name, type, value, checked } = event.target;
    setFormData((current) => ({
      ...current,
      [name]: type === 'checkbox' ? checked : value,
    }));
    setSubmitError('');
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!event.currentTarget.reportValidity()) return;

    setIsSubmitting(true);
    setSubmitError('');
    try {
      const result = await submitEnterpriseOnboardingRequest(formData);
      navigate('/v2/enterprise-request-pending', {
        replace: true,
        state: { request: result },
      });
    } catch (error) {
      console.error('Unable to submit enterprise onboarding request', error);
      if (error.status === 409) {
        setSubmitError('That workspace URL is already in use. Choose another one.');
      } else if (error.status === 401) {
        setSubmitError('Your session is not authorized. Please sign in again.');
      } else {
        setSubmitError(error.message || 'We could not submit your request right now. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Helmet>
        <title>Request an enterprise account | Airabook</title>
        <meta name="description" content="Request an Airabook enterprise workspace for System Administrator approval." />
      </Helmet>
      <div className="min-h-full bg-background px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="mb-2 text-sm font-semibold uppercase tracking-[0.18em] text-primary">Enterprise request</p>
                  <h2 className="text-2xl font-semibold tracking-[-0.035em] text-foreground sm:text-3xl">Request a managed workspace</h2>
                  <p className="mt-2 max-w-2xl text-base leading-6 text-muted-foreground">Tell us about your organization. A System Administrator will review your request before the workspace becomes available.</p>
                </div>
                  <p className="shrink-0 text-base text-muted-foreground">Already have a workspace? <Link to="/v2/workspaces" className="font-semibold text-primary hover:text-primary">Open workspaces</Link></p>
              </div>
              <Card className="mt-6 p-5 sm:p-8">
                <EnterpriseRequestForm
                  formData={formData}
                  isSubmitting={isSubmitting}
                  submitError={submitError}
                  onChange={updateFormData}
                  onSubmit={handleSubmit}
                />
              </Card>
        </div>
      </div>
    </>
  );
};

const EnterpriseRequestForm = ({ formData, isSubmitting, submitError, onChange, onSubmit }) => (
  <form onSubmit={onSubmit} className="space-y-5">
    <WorkspaceNotice className="flex items-start gap-3">
      <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
      <p><strong className="font-semibold text-foreground">Your Personal Account is connected.</strong> It will become the workspace owner after System Administrator approval.</p>
    </WorkspaceNotice>

    <AuthField id="company-name" name="proposed_account_name" label="Enterprise name" icon={Building2} placeholder="e.g. Acme Corporation" value={formData.proposed_account_name} onChange={onChange} required />
    <div>
      <label htmlFor="workspace-slug" className="mb-2 block text-sm font-semibold text-foreground">Requested workspace URL</label>
      <div className="flex overflow-hidden rounded-md border border-input bg-card focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
        <AppInput id="workspace-slug" name="workspace_slug" required minLength={3} maxLength={100} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" title="Use 3–100 lowercase letters or numbers, with single hyphens between words" placeholder="acme" value={formData.workspace_slug} onChange={onChange} className="min-w-0 flex-1 rounded-none border-0 focus-visible:ring-0" />
        <span className="flex items-center border-l border-border bg-muted/50 px-3 text-base text-muted-foreground">.airabook.com</span>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">Use lowercase letters, numbers, and hyphens. The final URL is confirmed after approval.</p>
    </div>

    <div className="grid gap-5 sm:grid-cols-2">
      <AuthField id="website" name="website" label="Enterprise website" icon={Globe2} type="url" placeholder="https://yourcompany.com" value={formData.website} onChange={onChange} required />
      <div><label htmlFor="country" className="mb-2 block text-sm font-semibold text-foreground">Country</label><NativeSelect id="country" name="country" required value={formData.country} onChange={onChange} className="h-12 bg-card px-4"><option value="" disabled>Select your country</option>{COUNTRY_OPTIONS.map(({ value, flag }) => <option key={value} value={value}>{flag} {value}</option>)}</NativeSelect></div>
    </div>

    <div className="grid gap-5 sm:grid-cols-2">
      <AuthField id="contact-person-name" name="contact_person_name" label="Contact person" icon={User} placeholder="Full name" value={formData.contact_person_name} onChange={onChange} required />
      <AuthField id="contact-phone" name="phone" label="Phone number" icon={Phone} type="tel" autoComplete="tel" placeholder="+1 555 000 0000" value={formData.phone} onChange={onChange} required />
    </div>
    <AuthField id="contact-email" name="contact_email" label="Contact email" icon={Mail} type="email" autoComplete="email" placeholder="you@company.com" value={formData.contact_email} onChange={onChange} required />

    <div><label htmlFor="business-description" className="mb-2 block text-sm font-semibold text-foreground">How will your organization use Airabook?</label><Textarea id="business-description" name="business_description" required minLength={20} rows={4} placeholder="Tell us how your organization plans to use Airabook..." value={formData.business_description} onChange={onChange} className="resize-y bg-card px-4 py-3 text-foreground" /><p className="mt-2 text-sm text-muted-foreground">At least 20 characters.</p></div>

    <label className="flex items-start gap-3 rounded-xl border border-border bg-card p-4 text-sm leading-5 text-muted-foreground"><input type="checkbox" name="terms_accepted" required checked={formData.terms_accepted} onChange={onChange} className="mt-1 h-4 w-4 shrink-0 rounded-sm border-input accent-primary focus-visible:ring-2 focus-visible:ring-ring" />I confirm that the information provided is accurate and agree that Airabook may contact me about this request.</label>
    {submitError && <WorkspaceNotice role="alert" tone="danger">{submitError}</WorkspaceNotice>}
    <Button type="submit" disabled={isSubmitting} variant="appPrimary" size="lg" className="h-auto min-h-12 w-full whitespace-normal py-3"><ArrowRight className="mr-2 h-4 w-4 shrink-0" />{isSubmitting ? 'Submitting request…' : 'Submit for System Administrator approval'}</Button>
    <p className="flex items-center justify-center gap-2 text-center text-sm text-muted-foreground"><Info className="h-3.5 w-3.5" />Your workspace becomes available after approval.</p>
  </form>
);

export default EnterpriseSignup;
