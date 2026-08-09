import { LegalScreen } from '../components/information/information-screen';
import { termsPage } from '../components/information/terms-content';

export default function TermsOfUseScreen() {
    return <LegalScreen page={termsPage} testID="terms-of-use-screen" />;
}
