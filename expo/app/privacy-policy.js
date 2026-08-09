import { LegalScreen } from '../components/information/information-screen';
import { privacyPage } from '../components/information/privacy-content';

export default function PrivacyPolicyScreen() {
    return <LegalScreen page={privacyPage} testID="privacy-policy-screen" />;
}
